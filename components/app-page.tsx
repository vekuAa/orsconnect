import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/role-navigation";
import type { AppProfile, Role } from "@/lib/types";
import { AppShell } from "./app-shell";

export async function AppPage({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Role[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!row) redirect("/setup");

  const profile: AppProfile = {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    role: row.role as Role,
    status: row.status,
  };

  if (profile.status !== "active") {
    redirect("/login?error=inactive");
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    redirect(roleHome[profile.role]);
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}