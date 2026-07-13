"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type { BillingType, PaymentMode } from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

interface Site {
  id: string;
  name: string;
  city: string;
  address: string;
  dailyTarget: number;
}

interface WorkDay {
  id: string;
  work_date: string;
  started_at: string | null;
  ended_at: string | null;
  validated_by: string | null;
  notes: string | null;
}

interface Contract {
  payment_mode: PaymentMode;
  day_rate: number | string;
  vo_rate: number | string;
  vn_rate: number | string;
  relavage_rate: number | string;
  tres_sale_rate: number | string;
  daily_deduction: number | string;
}

interface VehicleRow {
  id: string;
  plate: string;
  model: string | null;
  billing_type: BillingType;
  status: "waiting" | "washing" | "done" | "cancelled";
  provider_id: string | null;
  completed_at: string | null;
  provider_amount: number | string;
}

interface FinanceRow {
  provider_amount: number | string;
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function contractLabel(contract: Contract | null) {
  if (!contract) return "Aucun contrat actif";
  return contract.payment_mode === "day" ? "Forfait journalier" : "Paiement à la voiture";
}

export function ProviderPortal() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [contract, setContract] = useState<Contract | null>(null);
  const [todayWorkDay, setTodayWorkDay] = useState<WorkDay | null>(null);
  const [history, setHistory] = useState<WorkDay[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"start" | "end" | "">("");
  const [error, setError] = useState("");

  const loadSite = useCallback(async (siteId: string, providerId: string) => {
    if (!siteId || !providerId) return;
    setError("");

    const today = localDate();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [contractResult, dayResult, historyResult, vehicleResult, financeResult] = await Promise.all([
      supabase
        .from("provider_contracts")
        .select("payment_mode, day_rate, vo_rate, vn_rate, relavage_rate, tres_sale_rate, daily_deduction")
        .eq("provider_id", providerId)
        .eq("concession_id", siteId)
        .eq("active", true)
        .lte("starts_on", today)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("work_days")
        .select("id, work_date, started_at, ended_at, validated_by, notes")
        .eq("provider_id", providerId)
        .eq("concession_id", siteId)
        .eq("work_date", today)
        .maybeSingle(),
      supabase
        .from("work_days")
        .select("id, work_date, started_at, ended_at, validated_by, notes")
        .eq("provider_id", providerId)
        .eq("concession_id", siteId)
        .order("work_date", { ascending: false })
        .limit(10),
      supabase
        .from("vehicles")
        .select("id, plate, model, billing_type, status, provider_id, completed_at, provider_amount")
        .eq("concession_id", siteId)
        .neq("status", "cancelled")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("financial_entries")
        .select("provider_amount")
        .eq("provider_id", providerId)
        .eq("concession_id", siteId)
        .eq("entry_date", today),
    ]);

    const firstError =
      contractResult.error ??
      dayResult.error ??
      historyResult.error ??
      vehicleResult.error ??
      financeResult.error;

    if (firstError) {
      setError(firstError.message);
      return;
    }

    setContract((contractResult.data as Contract | null) ?? null);
    setTodayWorkDay((dayResult.data as WorkDay | null) ?? null);
    setHistory((historyResult.data as WorkDay[] | null) ?? []);
    setVehicles((vehicleResult.data as VehicleRow[] | null) ?? []);
    setFinanceRows((financeResult.data as FinanceRow[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: profile, error: profileError }, { data: accessRows, error: accessError }] = await Promise.all([
        supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
        supabase.from("concession_access").select("concession_id").eq("profile_id", user.id),
      ]);

      if (!active) return;
      if (profileError || accessError || !profile) {
        setError(profileError?.message ?? accessError?.message ?? "Profil introuvable.");
        setLoading(false);
        return;
      }

      if (profile.role !== "prestataire") {
        setError("Cette page est réservée aux prestataires.");
        setLoading(false);
        return;
      }

      const ids = (accessRows ?? []).map((row) => row.concession_id as string);
      let siteRows: Array<{ id: string; name: string; city: string; address: string; daily_target: number }> = [];

      if (ids.length) {
        const { data, error: siteError } = await supabase
          .from("concessions")
          .select("id, name, city, address, daily_target")
          .in("id", ids)
          .eq("active", true)
          .is("archived_at", null)
          .order("name");

        if (siteError) {
          setError(siteError.message);
          setLoading(false);
          return;
        }
        siteRows = data ?? [];
      }

      const mappedSites = siteRows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        address: row.address,
        dailyTarget: row.daily_target,
      }));

      const requested = new URLSearchParams(window.location.search).get("site") ?? "";
      const firstSiteId = mappedSites.some((site) => site.id === requested)
        ? requested
        : mappedSites[0]?.id ?? "";

      setUserId(user.id);
      setFullName(profile.full_name);
      setSites(mappedSites);
      setSelectedSiteId(firstSiteId);

      if (firstSiteId) await loadSite(firstSiteId, user.id);
      setLoading(false);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [loadSite, supabase]);

  useEffect(() => {
    if (!selectedSiteId || !userId) return;

    const vehicleChannel = supabase
      .channel(`provider-vehicles-${selectedSiteId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles", filter: `concession_id=eq.${selectedSiteId}` },
        () => void loadSite(selectedSiteId, userId),
      )
      .subscribe();

    const dayChannel = supabase
      .channel(`provider-day-${selectedSiteId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_days", filter: `provider_id=eq.${userId}` },
        () => void loadSite(selectedSiteId, userId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(vehicleChannel);
      void supabase.removeChannel(dayChannel);
    };
  }, [loadSite, selectedSiteId, supabase, userId]);

  const changeSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    setLoading(true);
    await loadSite(siteId, userId);
    setLoading(false);
  };

  const startDay = async () => {
    setActionLoading("start");
    setError("");
    const { error: rpcError } = await supabase.rpc("start_work_day", {
      p_concession_id: selectedSiteId,
    });
    if (rpcError) setError(rpcError.message);
    await loadSite(selectedSiteId, userId);
    setActionLoading("");
  };

  const endDay = async () => {
    setActionLoading("end");
    setError("");
    const { error: rpcError } = await supabase.rpc("end_work_day", {
      p_concession_id: selectedSiteId,
    });
    if (rpcError) setError(rpcError.message);
    await loadSite(selectedSiteId, userId);
    setActionLoading("");
  };

  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const ownVehicles = vehicles.filter((vehicle) => vehicle.provider_id === userId);
  const doneVehicles = ownVehicles.filter((vehicle) => vehicle.status === "done");
  const washingVehicles = ownVehicles.filter((vehicle) => vehicle.status === "washing");
  const waitingVehicles = vehicles.filter((vehicle) => vehicle.status === "waiting");
  const finalAmount = financeRows.reduce((sum, row) => sum + numeric(row.provider_amount), 0);
  const estimatedDayAmount = contract?.payment_mode === "day"
    ? Math.max(numeric(contract.day_rate) - numeric(contract.daily_deduction), 0)
    : 0;
  const displayedAmount = finalAmount > 0
    ? finalAmount
    : todayWorkDay?.started_at
      ? estimatedDayAmount
      : 0;
  const amountIsEstimate = finalAmount === 0 && displayedAmount > 0;

  const dayState = !todayWorkDay?.started_at
    ? "Non démarrée"
    : todayWorkDay.ended_at
      ? "Terminée"
      : "En cours";

  if (loading) {
    return (
      <section className="panel loading-panel">
        <strong>Chargement de ton espace prestataire…</strong>
        <span>Synchronisation des journées et des véhicules</span>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Espace prestataire"
        title={`Bonjour ${fullName.split(" ")[0] || ""}`.trim()}
        description="Déclare ta journée, suis les véhicules et consulte ta rémunération personnelle."
        actions={selectedSite ? (
          <Link className="primary-button" href={`/vehicles?site=${selectedSite.id}`}>
            <Icon name="car" size={18} /> Ouvrir les véhicules
          </Link>
        ) : undefined}
      />

      {error && <div className="page-alert page-alert--error"><Icon name="warning" size={18} />{error}</div>}

      {!sites.length ? (
        <section className="panel portal-empty-state">
          <Icon name="building" size={32} />
          <h2>Aucune concession affectée</h2>
          <p>Ton compte existe, mais ORS ne t’a pas encore rattaché à une concession active.</p>
        </section>
      ) : (
        <>
          <section className="portal-hero portal-hero--provider">
            <div className="portal-hero__site">
              <span className="portal-icon"><Icon name="building" /></span>
              <div>
                <small>Concession active</small>
                <select value={selectedSiteId} onChange={(event) => void changeSite(event.target.value)}>
                  {sites.map((site) => <option value={site.id} key={site.id}>{site.name} · {site.city}</option>)}
                </select>
                <p>{selectedSite?.address}</p>
              </div>
            </div>

            <div className="portal-day-control">
              <div className={`portal-day-status ${todayWorkDay?.ended_at ? "portal-day-status--done" : todayWorkDay?.started_at ? "portal-day-status--active" : ""}`}>
                <span><Icon name="clock" size={18} /></span>
                <div><small>Journée du jour</small><strong>{dayState}</strong></div>
              </div>
              {!todayWorkDay?.started_at ? (
                <button type="button" className="primary-button portal-day-button" onClick={startDay} disabled={actionLoading !== ""}>
                  <Icon name="clock" size={18} /> {actionLoading === "start" ? "Démarrage…" : "Commencer ma journée"}
                </button>
              ) : !todayWorkDay.ended_at ? (
                <button type="button" className="primary-button portal-day-button portal-day-button--end" onClick={endDay} disabled={actionLoading !== ""}>
                  <Icon name="check" size={18} /> {actionLoading === "end" ? "Clôture…" : "Terminer ma journée"}
                </button>
              ) : (
                <div className="portal-day-complete"><Icon name="check" size={18} /> Journée clôturée à {timeLabel(todayWorkDay.ended_at)}</div>
              )}
            </div>
          </section>

          <section className="portal-stat-grid">
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--blue"><Icon name="clock" /></span>
              <div><small>Horaires déclarés</small><strong>{timeLabel(todayWorkDay?.started_at ?? null)} — {timeLabel(todayWorkDay?.ended_at ?? null)}</strong><p>{todayWorkDay?.validated_by ? "Validée par la concession" : "En attente de validation"}</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--green"><Icon name="check" /></span>
              <div><small>Véhicules terminés</small><strong>{doneVehicles.length}</strong><p>{washingVehicles.length} actuellement en lavage</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--amber"><Icon name="car" /></span>
              <div><small>À traiter sur le site</small><strong>{waitingVehicles.length}</strong><p>Objectif du site : {selectedSite?.dailyTarget ?? 0} / jour</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--violet"><Icon name="wallet" /></span>
              <div><small>Rémunération du jour</small><strong>{formatCurrency(displayedAmount)}</strong><p>{amountIsEstimate ? "Estimation selon ton forfait" : "Montant enregistré"}</p></div>
            </article>
          </section>

          <section className="portal-two-columns">
            <article className="panel portal-panel">
              <div className="panel__header portal-panel__header">
                <div><span className="panel__eyebrow">Contrat actif</span><h2>{contractLabel(contract)}</h2></div>
                <span className="status-pill status-pill--active"><i />Actif</span>
              </div>
              <div className="portal-contract">
                {contract?.payment_mode === "day" ? (
                  <>
                    <div><span>Forfait journalier</span><strong>{formatCurrency(numeric(contract.day_rate))}</strong></div>
                    <div><span>Retenue journalière</span><strong>{formatCurrency(numeric(contract.daily_deduction))}</strong></div>
                    <div className="portal-contract__highlight"><span>Net estimé</span><strong>{formatCurrency(estimatedDayAmount)}</strong></div>
                  </>
                ) : contract ? (
                  <>
                    <div><span>VO</span><strong>{formatCurrency(numeric(contract.vo_rate))}</strong></div>
                    <div><span>VN</span><strong>{formatCurrency(numeric(contract.vn_rate))}</strong></div>
                    <div><span>Relavage</span><strong>{formatCurrency(numeric(contract.relavage_rate))}</strong></div>
                    <div><span>Très sale</span><strong>{formatCurrency(numeric(contract.tres_sale_rate))}</strong></div>
                  </>
                ) : (
                  <p className="portal-muted-copy">Aucun contrat actif n’a été trouvé pour cette concession.</p>
                )}
              </div>
            </article>

            <article className="panel portal-panel">
              <div className="panel__header portal-panel__header">
                <div><span className="panel__eyebrow">Activité personnelle</span><h2>Mes véhicules du jour</h2></div>
                <Link href={`/vehicles?site=${selectedSiteId}`} className="portal-inline-link">Voir le tableau <Icon name="arrow" size={15} /></Link>
              </div>
              <div className="portal-vehicle-list">
                {ownVehicles.length ? ownVehicles.slice(0, 6).map((vehicle) => (
                  <div className="portal-vehicle-row" key={vehicle.id}>
                    <span className={`portal-vehicle-state portal-vehicle-state--${vehicle.status}`} />
                    <div><strong>{vehicle.plate}</strong><small>{vehicle.model || "Modèle non renseigné"}</small></div>
                    {contract?.payment_mode === "vehicle" && (
                      <span className="neutral-tag">
                        {vehicle.billing_type
                          .replace("tres_sale", "Très sale")
                          .toUpperCase()}
                      </span>
                    )}
                    <b>{vehicle.status === "done" ? "Terminé" : vehicle.status === "washing" ? "En lavage" : "À laver"}</b>
                  </div>
                )) : (
                  <div className="portal-list-empty"><Icon name="car" size={25} /><strong>Aucun véhicule pris en charge</strong><span>Ouvre le tableau des véhicules pour commencer une prestation.</span></div>
                )}
              </div>
            </article>
          </section>

          <section className="panel portal-panel portal-history-panel">
            <div className="panel__header portal-panel__header">
              <div><span className="panel__eyebrow">Historique</span><h2>Mes dernières journées</h2></div>
            </div>
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Durée</th><th>Validation</th></tr></thead>
                <tbody>
                  {history.length ? history.map((day) => {
                    const duration = day.started_at && day.ended_at
                      ? Math.max(0, Math.round((new Date(day.ended_at).getTime() - new Date(day.started_at).getTime()) / 60000))
                      : null;
                    return (
                      <tr key={day.id}>
                        <td><strong>{dateLabel(day.work_date)}</strong></td>
                        <td>{timeLabel(day.started_at)}</td>
                        <td>{timeLabel(day.ended_at)}</td>
                        <td>{duration === null ? "—" : `${Math.floor(duration / 60)} h ${String(duration % 60).padStart(2, "0")}`}</td>
                        <td>{day.validated_by ? <span className="status-pill status-pill--active"><i />Validée</span> : <span className="status-pill">En attente</span>}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5}><div className="portal-table-empty">Aucune journée déclarée pour le moment.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
