import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingMode } from "@/lib/types";

interface ConcessionPayload {
  name: string;
  address: string;
  city: string;
  contactEmail?: string;
  managerName: string;
  managerEmail: string;
  managerPhone?: string;
  managerPassword?: string;
  dailyTarget?: number;
  billingMode?: BillingMode;
  billedDayRate?: number;
  billedVoRate?: number;
  billedVnRate?: number;
  billedRelavageRate?: number;
  billedTresSaleRate?: number;
}

interface UpdateConcessionBody extends Partial<ConcessionPayload> {
  concessionId: string;
  active?: boolean;
}

interface DeleteConcessionBody {
  concessionId: string;
}

function amount(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }

  const { data: caller, error } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (error || !caller || caller.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Accès administrateur requis" },
        { status: 403 },
      ),
    };
  }

  return { supabase, caller };
}

async function findConcessionManager(
  admin: ReturnType<typeof createAdminClient>,
  concessionId: string,
) {
  const { data: accessRows } = await admin
    .from("concession_access")
    .select("profile_id")
    .eq("concession_id", concessionId);

  const ids = (accessRows ?? []).map((row) => row.profile_id as string);
  if (!ids.length) return null;

  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", ids)
    .eq("role", "concession")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  return data;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: ConcessionPayload;
  try {
    body = (await request.json()) as ConcessionPayload;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const name = body.name?.trim();
  const city = body.city?.trim();
  const address = body.address?.trim();
  const managerName = body.managerName?.trim();
  const managerEmail = body.managerEmail?.trim().toLowerCase();
  const managerPassword = body.managerPassword ?? "";
  const billingMode: BillingMode =
    body.billingMode === "vehicle" ? "vehicle" : "day";

  if (
    !name ||
    !city ||
    !address ||
    !managerName ||
    !managerEmail ||
    managerPassword.length < 8
  ) {
    return NextResponse.json(
      {
        error:
          "Concession, adresse, responsable, e-mail et mot de passe de 8 caractères minimum requis.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: concession, error: concessionError } = await admin
    .from("concessions")
    .insert({
      organization_id: auth.caller.organization_id,
      name,
      address,
      city,
      contact_email: body.contactEmail?.trim().toLowerCase() || managerEmail,
      manager_name: managerName,
      manager_email: managerEmail,
      daily_target: positiveInteger(body.dailyTarget, 24),
      billing_mode: billingMode,
      billed_day_rate: amount(body.billedDayRate, 190),
      billed_vo_rate: amount(body.billedVoRate, 30),
      billed_vn_rate: amount(body.billedVnRate, 25),
      billed_relavage_rate: amount(body.billedRelavageRate, 20),
      billed_tres_sale_rate: amount(body.billedTresSaleRate, 45),
      active: true,
    })
    .select("id")
    .single();

  if (concessionError || !concession) {
    return NextResponse.json(
      {
        error:
          concessionError?.message ?? "Création de la concession impossible",
      },
      { status: 400 },
    );
  }

  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email: managerEmail,
      password: managerPassword,
      email_confirm: true,
      user_metadata: {
        full_name: managerName,
        role: "concession",
      },
    });

  if (createUserError || !created.user) {
    await admin.from("concessions").delete().eq("id", concession.id);
    return NextResponse.json(
      {
        error:
          createUserError?.message ??
          "Création du compte concession impossible",
      },
      { status: 400 },
    );
  }

  const managerId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: managerId,
    organization_id: auth.caller.organization_id,
    full_name: managerName,
    email: managerEmail,
    phone: body.managerPhone?.trim() || null,
    role: "concession",
    status: "active",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(managerId);
    await admin.from("concessions").delete().eq("id", concession.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const { error: accessError } = await admin.from("concession_access").insert({
    profile_id: managerId,
    concession_id: concession.id,
  });

  if (accessError) {
    await admin.from("profiles").delete().eq("id", managerId);
    await admin.auth.admin.deleteUser(managerId);
    await admin.from("concessions").delete().eq("id", concession.id);
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      id: concession.id,
      name,
      billingMode,
      managerId,
      managerEmail,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: UpdateConcessionBody;
  try {
    body = (await request.json()) as UpdateConcessionBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const concessionId = body.concessionId?.trim();
  if (!concessionId) {
    return NextResponse.json(
      { error: "Concession invalide" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: concession, error: concessionError } = await admin
    .from("concessions")
    .select(
      "id, name, address, city, contact_email, manager_name, manager_email, daily_target, billing_mode, billed_day_rate, billed_vo_rate, billed_vn_rate, billed_relavage_rate, billed_tres_sale_rate, active",
    )
    .eq("id", concessionId)
    .eq("organization_id", auth.caller.organization_id)
    .is("archived_at", null)
    .maybeSingle();

  if (concessionError || !concession) {
    return NextResponse.json(
      { error: "Concession introuvable" },
      { status: 404 },
    );
  }

  const update: Record<string, unknown> = {};
  if (body.name?.trim()) update.name = body.name.trim();
  if (body.address?.trim()) update.address = body.address.trim();
  if (body.city?.trim()) update.city = body.city.trim();
  if (body.contactEmail !== undefined) {
    update.contact_email = body.contactEmail.trim().toLowerCase() || null;
  }
  if (body.managerName?.trim()) update.manager_name = body.managerName.trim();
  if (body.managerEmail?.trim()) {
    update.manager_email = body.managerEmail.trim().toLowerCase();
  }
  if (body.dailyTarget !== undefined) {
    update.daily_target = positiveInteger(body.dailyTarget, concession.daily_target);
  }
  if (body.billingMode) {
    update.billing_mode = body.billingMode === "vehicle" ? "vehicle" : "day";
  }
  if (body.billedDayRate !== undefined) {
    update.billed_day_rate = amount(body.billedDayRate, concession.billed_day_rate);
  }
  if (body.billedVoRate !== undefined) {
    update.billed_vo_rate = amount(body.billedVoRate, concession.billed_vo_rate);
  }
  if (body.billedVnRate !== undefined) {
    update.billed_vn_rate = amount(body.billedVnRate, concession.billed_vn_rate);
  }
  if (body.billedRelavageRate !== undefined) {
    update.billed_relavage_rate = amount(
      body.billedRelavageRate,
      concession.billed_relavage_rate,
    );
  }
  if (body.billedTresSaleRate !== undefined) {
    update.billed_tres_sale_rate = amount(
      body.billedTresSaleRate,
      concession.billed_tres_sale_rate,
    );
  }
  if (body.active !== undefined) update.active = body.active;

  if (Object.keys(update).length) {
    const { error } = await admin
      .from("concessions")
      .update(update)
      .eq("id", concessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const manager = await findConcessionManager(admin, concessionId);
  if (manager) {
    const profileUpdate: Record<string, unknown> = {};
    const authUpdate: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, string>;
      ban_duration?: string;
    } = {};

    if (body.managerName?.trim()) {
      profileUpdate.full_name = body.managerName.trim();
      authUpdate.user_metadata = {
        full_name: body.managerName.trim(),
        role: "concession",
      };
    }
    if (body.managerEmail?.trim()) {
      const email = body.managerEmail.trim().toLowerCase();
      profileUpdate.email = email;
      authUpdate.email = email;
    }
    if (body.managerPhone !== undefined) {
      profileUpdate.phone = body.managerPhone.trim() || null;
    }
    if (body.managerPassword) {
      if (body.managerPassword.length < 8) {
        return NextResponse.json(
          { error: "Le nouveau mot de passe doit contenir 8 caractères minimum." },
          { status: 400 },
        );
      }
      authUpdate.password = body.managerPassword;
    }
    if (body.active !== undefined) {
      profileUpdate.status = body.active ? "active" : "inactive";
      authUpdate.ban_duration = body.active ? "none" : "876000h";
    }

    if (Object.keys(authUpdate).length) {
      const { error } = await admin.auth.admin.updateUserById(
        manager.id,
        authUpdate,
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    if (Object.keys(profileUpdate).length) {
      const { error } = await admin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", manager.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ id: concessionId, updated: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: DeleteConcessionBody;
  try {
    body = (await request.json()) as DeleteConcessionBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const concessionId = body.concessionId?.trim();
  if (!concessionId) {
    return NextResponse.json(
      { error: "Concession invalide" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: concession } = await admin
    .from("concessions")
    .select("id")
    .eq("id", concessionId)
    .eq("organization_id", auth.caller.organization_id)
    .is("archived_at", null)
    .maybeSingle();

  if (!concession) {
    return NextResponse.json(
      { error: "Concession introuvable" },
      { status: 404 },
    );
  }

  const archivedAt = new Date().toISOString();
  const today = archivedAt.slice(0, 10);

  const { error: archiveError } = await admin
    .from("concessions")
    .update({ active: false, archived_at: archivedAt })
    .eq("id", concessionId);
  if (archiveError) {
    return NextResponse.json({ error: archiveError.message }, { status: 400 });
  }

  await admin
    .from("provider_contracts")
    .update({ active: false, ends_on: today })
    .eq("concession_id", concessionId)
    .eq("active", true);

  const { data: accessRows } = await admin
    .from("concession_access")
    .select("profile_id")
    .eq("concession_id", concessionId);
  const profileIds = (accessRows ?? []).map((row) => row.profile_id as string);

  if (profileIds.length) {
    const { data: managerProfiles } = await admin
      .from("profiles")
      .select("id")
      .in("id", profileIds)
      .eq("role", "concession");

    for (const manager of managerProfiles ?? []) {
      await admin
        .from("profiles")
        .update({ status: "inactive", archived_at: archivedAt })
        .eq("id", manager.id);
      await admin.auth.admin.updateUserById(manager.id, {
        ban_duration: "876000h",
      });
    }
  }

  return NextResponse.json({ id: concessionId, archived: true });
}