import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrsLogo } from "@/components/logo";
import { SetupForm } from "@/components/setup-form";

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect("/dashboard");

  return (
    <main className="setup-page">
      <section className="setup-card">
        <OrsLogo />
        <span className="eyebrow">Première configuration</span>
        <h1>Initialiser ORS Connect</h1>
        <p>Crée le premier compte administrateur et la première concession. Cette opération n’est possible qu’une seule fois.</p>
        <SetupForm defaultEmail={user.email ?? ""} />
      </section>
    </main>
  );
}
