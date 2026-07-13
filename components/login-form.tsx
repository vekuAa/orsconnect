"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { roleHome } from "@/lib/role-navigation";
import type { Role } from "@/lib/types";
import { Icon } from "./icons";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "inactive" ? "Ce compte est désactivé. Contacte ORS." : "",
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Renseigne ton adresse e-mail et ton mot de passe.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError("Identifiants incorrects ou compte non confirmé.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    if (!profile) {
      router.replace("/setup");
      router.refresh();
      return;
    }

    if (profile.status !== "active") {
      await supabase.auth.signOut();
      setError("Ce compte est désactivé. Contacte ORS.");
      setLoading(false);
      return;
    }

    const next = searchParams.get("next");
    router.replace(next && next !== "/login" ? next : roleHome[profile.role as Role]);
    router.refresh();
  };

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="email">Adresse e-mail</label>
        <div className="input-with-icon">
          <Icon name="mail" size={18} />
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="contact@entreprise.fr" />
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="password">Mot de passe</label>
        <div className="input-with-icon">
          <Icon name="shield" size={18} />
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button className="primary-button primary-button--wide" type="submit" disabled={loading}>
        {loading ? "Connexion…" : "Se connecter"}
        {!loading && <Icon name="arrow" size={18} />}
      </button>

      <div className="demo-notice">
        <span className="demo-notice__icon"><Icon name="shield" size={16} /></span>
        <p><strong>Accès sécurisé</strong><br />Tu seras redirigé automatiquement vers l’espace correspondant à ton rôle.</p>
      </div>
    </form>
  );
}
