"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./icons";

export function SetupForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("Équipe ORS");
  const [concessionName, setConcessionName] = useState("Première concession");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("bootstrap_first_admin", {
      p_full_name: fullName.trim(),
      p_concession_name: concessionName.trim(),
      p_city: city.trim(),
      p_address: address.trim(),
    });

    if (rpcError) {
      setError(rpcError.message || "Impossible d’initialiser ORS Connect.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <form className="setup-form" onSubmit={submit}>
      <label className="field-group"><span>Compte connecté</span><input value={defaultEmail} disabled /></label>
      <label className="field-group"><span>Nom affiché *</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
      <label className="field-group"><span>Nom de la première concession *</span><input value={concessionName} onChange={(e) => setConcessionName(e.target.value)} required /></label>
      <div className="form-grid">
        <label className="field-group"><span>Ville *</span><input value={city} onChange={(e) => setCity(e.target.value)} required /></label>
        <label className="field-group"><span>Adresse *</span><input value={address} onChange={(e) => setAddress(e.target.value)} required /></label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <button className="primary-button primary-button--wide" disabled={loading} type="submit">
        {loading ? "Initialisation…" : "Créer l’espace ORS"}
        {!loading && <Icon name="arrow" size={18} />}
      </button>
    </form>
  );
}
