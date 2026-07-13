import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingType, PaymentMode } from "@/lib/types";

interface ProviderRatesBody {
  day?: number;
  vo?: number;
  vn?: number;
  relavage?: number;
  tres_sale?: number;
}

interface CreateProviderBody {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  concessionId: string;
  paymentMode: PaymentMode;
  rates: Record<BillingType | "day", number>;
  dailyDeduction?: number;
}

interface UpdateProviderBody {
  providerId: string;
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  concessionId?: string;
  paymentMode?: PaymentMode;
  rates?: ProviderRatesBody;
  dailyDeduction?: number;
  status?: "active" | "pending" | "inactive";
}

interface DeleteProviderBody {
  providerId: string;
}

function amount(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

async function findProvider(
  admin: ReturnType<typeof createAdminClient>,
  providerId: string,
  organizationId: string,
) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, status")
    .eq("id", providerId)
    .eq("organization_id", organizationId)
    .eq("role", "prestataire")
    .is("archived_at", null)
    .maybeSingle();

  return { provider: data, error };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: CreateProviderBody;
  try {
    body = (await request.json()) as CreateProviderBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;
  const password = body.password ?? "";
  const concessionId = body.concessionId?.trim();
  const paymentMode: PaymentMode =
    body.paymentMode === "vehicle" ? "vehicle" : "day";

  if (!fullName || !email || !concessionId || password.length < 8) {
    return NextResponse.json(
      {
        error:
          "Nom, e-mail, concession et mot de passe de 8 caractères minimum requis.",
      },
      { status: 400 },
    );
  }

  const { data: allowedConcession, error: concessionError } = await auth.supabase
    .from("concessions")
    .select("id")
    .eq("id", concessionId)
    .eq("organization_id", auth.caller.organization_id)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (concessionError || !allowedConcession) {
    return NextResponse.json(
      { error: "Concession inaccessible ou inactive" },
      { status: 403 },
    );
  }

  const rates = body.rates ?? {
    day: 0,
    vo: 0,
    vn: 0,
    relavage: 0,
    tres_sale: 0,
  };
  const admin = createAdminClient();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "prestataire" },
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Création du compte impossible" },
      { status: 400 },
    );
  }

  const providerId = created.user.id;

  const cleanup = async () => {
    await admin.from("provider_contracts").delete().eq("provider_id", providerId);
    await admin.from("concession_access").delete().eq("profile_id", providerId);
    await admin.from("profiles").delete().eq("id", providerId);
    await admin.auth.admin.deleteUser(providerId);
  };

  const { error: profileError } = await admin.from("profiles").insert({
    id: providerId,
    organization_id: auth.caller.organization_id,
    full_name: fullName,
    email,
    phone,
    role: "prestataire",
    status: "active",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(providerId);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const { error: accessError } = await admin.from("concession_access").insert({
    profile_id: providerId,
    concession_id: concessionId,
  });

  if (accessError) {
    await cleanup();
    return NextResponse.json({ error: accessError.message }, { status: 400 });
  }

  const { error: contractError } = await admin
    .from("provider_contracts")
    .insert({
      provider_id: providerId,
      concession_id: concessionId,
      payment_mode: paymentMode,
      day_rate: amount(rates.day),
      vo_rate: amount(rates.vo),
      vn_rate: amount(rates.vn),
      relavage_rate: amount(rates.relavage),
      tres_sale_rate: amount(rates.tres_sale),
      daily_deduction: amount(body.dailyDeduction),
      active: true,
    });

  if (contractError) {
    await cleanup();
    return NextResponse.json({ error: contractError.message }, { status: 400 });
  }

  return NextResponse.json(
    { id: providerId, email, fullName, concessionId, paymentMode },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: UpdateProviderBody;
  try {
    body = (await request.json()) as UpdateProviderBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const providerId = body.providerId?.trim();
  if (!providerId) {
    return NextResponse.json(
      { error: "Prestataire invalide" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { provider, error: providerError } = await findProvider(
    admin,
    providerId,
    auth.caller.organization_id,
  );

  if (providerError || !provider) {
    return NextResponse.json(
      { error: "Prestataire introuvable" },
      { status: 404 },
    );
  }

  if (body.concessionId) {
    const { data: concession } = await admin
      .from("concessions")
      .select("id")
      .eq("id", body.concessionId)
      .eq("organization_id", auth.caller.organization_id)
      .eq("active", true)
      .is("archived_at", null)
      .maybeSingle();

    if (!concession) {
      return NextResponse.json(
        { error: "Concession inaccessible ou inactive" },
        { status: 400 },
      );
    }
  }

  const authUpdate: {
    email?: string;
    password?: string;
    ban_duration?: string;
    user_metadata?: Record<string, string>;
  } = {};
  const profileUpdate: Record<string, unknown> = {};

  if (body.fullName?.trim()) {
    profileUpdate.full_name = body.fullName.trim();
    authUpdate.user_metadata = {
      full_name: body.fullName.trim(),
      role: "prestataire",
    };
  }
  if (body.email?.trim()) {
    const email = body.email.trim().toLowerCase();
    profileUpdate.email = email;
    authUpdate.email = email;
  }
  if (body.phone !== undefined) {
    profileUpdate.phone = body.phone.trim() || null;
  }
  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Le nouveau mot de passe doit contenir 8 caractères minimum." },
        { status: 400 },
      );
    }
    authUpdate.password = body.password;
  }
  if (body.status) {
    if (!(["active", "pending", "inactive"] as const).includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
    profileUpdate.status = body.status;
    authUpdate.ban_duration = body.status === "active" ? "none" : "876000h";
  }

  if (Object.keys(authUpdate).length) {
    const { error } = await admin.auth.admin.updateUserById(
      providerId,
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
      .eq("id", providerId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (body.concessionId) {
    const { error: accessDeleteError } = await admin
      .from("concession_access")
      .delete()
      .eq("profile_id", providerId);
    if (accessDeleteError) {
      return NextResponse.json(
        { error: accessDeleteError.message },
        { status: 400 },
      );
    }

    const { error: accessInsertError } = await admin
      .from("concession_access")
      .insert({
        profile_id: providerId,
        concession_id: body.concessionId,
      });
    if (accessInsertError) {
      return NextResponse.json(
        { error: accessInsertError.message },
        { status: 400 },
      );
    }
  }

  if (body.paymentMode && body.concessionId && body.rates) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: closeError } = await admin
      .from("provider_contracts")
      .update({ active: false, ends_on: today })
      .eq("provider_id", providerId)
      .eq("active", true);
    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 400 });
    }

    const { error: contractError } = await admin
      .from("provider_contracts")
      .insert({
        provider_id: providerId,
        concession_id: body.concessionId,
        payment_mode: body.paymentMode === "vehicle" ? "vehicle" : "day",
        day_rate: amount(body.rates.day),
        vo_rate: amount(body.rates.vo),
        vn_rate: amount(body.rates.vn),
        relavage_rate: amount(body.rates.relavage),
        tres_sale_rate: amount(body.rates.tres_sale),
        daily_deduction: amount(body.dailyDeduction),
        starts_on: today,
        active: body.status !== "inactive",
      });
    if (contractError) {
      return NextResponse.json({ error: contractError.message }, { status: 400 });
    }
  } else if (body.status) {
    const { error: contractError } = await admin
      .from("provider_contracts")
      .update({ active: body.status === "active" })
      .eq("provider_id", providerId);
    if (contractError) {
      return NextResponse.json({ error: contractError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ id: providerId, updated: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: DeleteProviderBody;
  try {
    body = (await request.json()) as DeleteProviderBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const providerId = body.providerId?.trim();
  if (!providerId) {
    return NextResponse.json(
      { error: "Prestataire invalide" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { provider } = await findProvider(
    admin,
    providerId,
    auth.caller.organization_id,
  );
  if (!provider) {
    return NextResponse.json(
      { error: "Prestataire introuvable" },
      { status: 404 },
    );
  }

  const archivedAt = new Date().toISOString();
  const today = archivedAt.slice(0, 10);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "inactive", archived_at: archivedAt })
    .eq("id", providerId);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  await admin
    .from("provider_contracts")
    .update({ active: false, ends_on: today })
    .eq("provider_id", providerId)
    .eq("active", true);

  const { error: authError } = await admin.auth.admin.updateUserById(
    providerId,
    { ban_duration: "876000h" },
  );
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  return NextResponse.json({ id: providerId, archived: true });
}