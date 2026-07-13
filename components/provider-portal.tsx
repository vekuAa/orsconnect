"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type { BillingType, PaymentMode } from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

type WorkDayType = "full" | "half" | "absent";

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
  day_type: WorkDayType;
  submitted_at: string | null;
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
}

interface FinanceRow {
  entry_date: string;
  provider_amount: number | string;
}

const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function dateLongLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function calendarCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: localDate(date),
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function dayTypeLabel(type: WorkDayType) {
  if (type === "half") return "Demi-journée";
  if (type === "absent") return "Absent";
  return "Journée complète";
}

function contractLabel(contract: Contract | null) {
  if (!contract) return "Aucun contrat actif";
  return contract.payment_mode === "day" ? "Forfait journalier" : "Paiement à la voiture";
}

function durationLabel(day: WorkDay | null) {
  if (!day?.started_at || !day.ended_at) return "—";
  const minutes = Math.max(
    0,
    Math.round((new Date(day.ended_at).getTime() - new Date(day.started_at).getTime()) / 60000),
  );
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export function ProviderPortal() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [contract, setContract] = useState<Contract | null>(null);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => localDate());
  const [declarationType, setDeclarationType] = useState<WorkDayType>("full");
  const [declarationNote, setDeclarationNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"start" | "end" | "declare" | "">("");
  const [error, setError] = useState("");

  const loadSite = useCallback(
    async (siteId: string, providerId: string, month: Date) => {
      if (!siteId || !providerId) return;
      setError("");

      const today = localDate();
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const monthStart = `${monthKey(month)}-01`;
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const monthEnd = `${monthKey(nextMonth)}-01`;

      const [contractResult, dayResult, vehicleResult, financeResult] = await Promise.all([
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
          .select("id, work_date, started_at, ended_at, validated_by, notes, day_type, submitted_at")
          .eq("provider_id", providerId)
          .eq("concession_id", siteId)
          .gte("work_date", monthStart)
          .lt("work_date", monthEnd)
          .order("work_date", { ascending: true }),
        supabase
          .from("vehicles")
          .select("id, plate, model, billing_type, status, provider_id, completed_at")
          .eq("concession_id", siteId)
          .neq("status", "cancelled")
          .gte("created_at", startToday.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("financial_entries")
          .select("entry_date, provider_amount")
          .eq("provider_id", providerId)
          .eq("concession_id", siteId)
          .gte("entry_date", monthStart)
          .lt("entry_date", monthEnd)
          .order("entry_date", { ascending: true }),
      ]);

      const firstError =
        contractResult.error ?? dayResult.error ?? vehicleResult.error ?? financeResult.error;

      if (firstError) {
        setError(firstError.message);
        return;
      }

      setContract((contractResult.data as Contract | null) ?? null);
      setWorkDays((dayResult.data as WorkDay[] | null) ?? []);
      setVehicles((vehicleResult.data as VehicleRow[] | null) ?? []);
      setFinanceRows((financeResult.data as FinanceRow[] | null) ?? []);
    },
    [supabase],
  );

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
      const initialMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      setUserId(user.id);
      setFullName(profile.full_name);
      setSites(mappedSites);
      setSelectedSiteId(firstSiteId);

      if (firstSiteId) await loadSite(firstSiteId, user.id, initialMonth);
      setLoading(false);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [loadSite, supabase]);

  useEffect(() => {
    if (!selectedSiteId || !userId) return;

    const dayChannel = supabase
      .channel(`provider-days-${selectedSiteId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_days", filter: `provider_id=eq.${userId}` },
        () => void loadSite(selectedSiteId, userId, calendarMonth),
      )
      .subscribe();

    const financeChannel = supabase
      .channel(`provider-finances-${selectedSiteId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_entries", filter: `provider_id=eq.${userId}` },
        () => void loadSite(selectedSiteId, userId, calendarMonth),
      )
      .subscribe();

    const vehicleChannel = supabase
      .channel(`provider-vehicles-${selectedSiteId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles", filter: `concession_id=eq.${selectedSiteId}` },
        () => void loadSite(selectedSiteId, userId, calendarMonth),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(dayChannel);
      void supabase.removeChannel(financeChannel);
      void supabase.removeChannel(vehicleChannel);
    };
  }, [calendarMonth, loadSite, selectedSiteId, supabase, userId]);

  const changeSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    setLoading(true);
    await loadSite(siteId, userId, calendarMonth);
    setLoading(false);
  };

  const moveMonth = async (offset: number) => {
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
    setCalendarMonth(next);
    const now = new Date();
    const nextSelected =
      next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth()
        ? localDate(now)
        : localDate(next);
    setSelectedDate(nextSelected);
    setLoading(true);
    await loadSite(selectedSiteId, userId, next);
    setLoading(false);
  };

  const startDay = async () => {
    setActionLoading("start");
    setError("");
    const { error: rpcError } = await supabase.rpc("start_work_day", {
      p_concession_id: selectedSiteId,
    });
    if (rpcError) setError(rpcError.message);
    await loadSite(selectedSiteId, userId, calendarMonth);
    setActionLoading("");
  };

  const endDay = async () => {
    setActionLoading("end");
    setError("");
    const { error: rpcError } = await supabase.rpc("end_work_day", {
      p_concession_id: selectedSiteId,
    });
    if (rpcError) setError(rpcError.message);
    await loadSite(selectedSiteId, userId, calendarMonth);
    setActionLoading("");
  };

  const declareDay = async () => {
    setActionLoading("declare");
    setError("");
    const { error: rpcError } = await supabase.rpc("declare_work_day", {
      p_concession_id: selectedSiteId,
      p_work_date: selectedDate,
      p_day_type: declarationType,
      p_notes: declarationNote || null,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadSite(selectedSiteId, userId, calendarMonth);
    }
    setActionLoading("");
  };

  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const todayKey = localDate();
  const todayWorkDay = workDays.find((day) => day.work_date === todayKey) ?? null;
  const selectedWorkDay = workDays.find((day) => day.work_date === selectedDate) ?? null;
  const ownVehicles = vehicles.filter((vehicle) => vehicle.provider_id === userId);
  const doneVehicles = ownVehicles.filter((vehicle) => vehicle.status === "done");
  const washingVehicles = ownVehicles.filter((vehicle) => vehicle.status === "washing");
  const waitingVehicles = vehicles.filter((vehicle) => vehicle.status === "waiting");

  const amountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of financeRows) {
      map.set(row.entry_date, (map.get(row.entry_date) ?? 0) + numeric(row.provider_amount));
    }
    return map;
  }, [financeRows]);

  const monthRevenue = financeRows.reduce((sum, row) => sum + numeric(row.provider_amount), 0);
  const todayRevenue = amountByDate.get(todayKey) ?? 0;
  const estimatedDayAmount = contract?.payment_mode === "day"
    ? Math.max(numeric(contract.day_rate) - numeric(contract.daily_deduction), 0)
    : 0;
  const displayedTodayAmount = todayRevenue > 0
    ? todayRevenue
    : todayWorkDay?.started_at
      ? todayWorkDay.day_type === "half"
        ? estimatedDayAmount / 2
        : estimatedDayAmount
      : 0;

  const fullDays = workDays.filter((day) => day.day_type === "full" && day.submitted_at).length;
  const halfDays = workDays.filter((day) => day.day_type === "half" && day.submitted_at).length;
  const absentDays = workDays.filter((day) => day.day_type === "absent" && day.submitted_at).length;
  const equivalentDays = fullDays + halfDays * 0.5;
  const recordedDays = workDays.filter((day) => day.submitted_at).length;
  const cells = calendarCells(calendarMonth);
  const selectedDateIsFuture = selectedDate > todayKey;

  useEffect(() => {
    if (!selectedWorkDay) {
      setDeclarationType("full");
      setDeclarationNote("");
      return;
    }
    setDeclarationType(selectedWorkDay.day_type);
    setDeclarationNote(selectedWorkDay.notes ?? "");
  }, [selectedWorkDay]);

  const dayState = !todayWorkDay?.started_at
    ? todayWorkDay?.day_type === "absent" && todayWorkDay.submitted_at
      ? "Absence déclarée"
      : "Non démarrée"
    : todayWorkDay.ended_at
      ? "Terminée"
      : "En cours";

  if (loading) {
    return (
      <section className="panel loading-panel">
        <strong>Chargement de ton espace prestataire…</strong>
        <span>Synchronisation du calendrier, des journées et du chiffre d’affaires</span>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Espace prestataire"
        title={`Bonjour ${fullName.split(" ")[0] || ""}`.trim()}
        description="Déclare tes journées, suis ton calendrier et consulte ton chiffre d’affaires jour par jour. Les véhicules démarrés ou terminés détectent automatiquement une demi-journée ou une journée complète."
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
                <button type="button" className="primary-button portal-day-button" onClick={startDay} disabled={actionLoading !== "" || todayWorkDay?.day_type === "absent"}>
                  <Icon name="clock" size={18} /> {actionLoading === "start" ? "Démarrage…" : "Commencer ma journée"}
                </button>
              ) : !todayWorkDay.ended_at ? (
                <button type="button" className="primary-button portal-day-button portal-day-button--end" onClick={endDay} disabled={actionLoading !== ""}>
                  <Icon name="check" size={18} /> {actionLoading === "end" ? "Clôture…" : "Terminer ma journée"}
                </button>
              ) : (
                <div className="portal-day-complete"><Icon name="check" size={18} /> Journée enregistrée à {timeLabel(todayWorkDay.ended_at)}</div>
              )}
            </div>
          </section>

          <section className="portal-stat-grid">
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--blue"><Icon name="calendar" /></span>
              <div><small>Jours équivalents ce mois</small><strong>{equivalentDays.toLocaleString("fr-FR")}</strong><p>{fullDays} complet(s) · {halfDays} demi · {absentDays} absence(s)</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--green"><Icon name="wallet" /></span>
              <div><small>Mon CA du mois</small><strong>{formatCurrency(monthRevenue)}</strong><p>{recordedDays} journée(s) enregistrée(s)</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--amber"><Icon name="trend" /></span>
              <div><small>Mon CA aujourd’hui</small><strong>{formatCurrency(displayedTodayAmount)}</strong><p>{todayRevenue > 0 ? "Montant enregistré" : displayedTodayAmount > 0 ? "Montant estimé" : "Aucun montant"}</p></div>
            </article>
            <article className="portal-stat">
              <span className="portal-stat__icon portal-stat__icon--violet"><Icon name="car" /></span>
              <div><small>Véhicules du jour</small><strong>{doneVehicles.length}</strong><p>{washingVehicles.length} en lavage · {waitingVehicles.length} à traiter</p></div>
            </article>
          </section>

          <section className="calendar-layout provider-calendar-layout">
            <article className="panel work-calendar-panel">
              <div className="work-calendar__header">
                <div>
                  <span className="panel__eyebrow">Mon calendrier</span>
                  <h2>{calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
                </div>
                <div className="calendar-navigation">
                  <button type="button" className="icon-button" onClick={() => void moveMonth(-1)} aria-label="Mois précédent"><Icon name="chevronLeft" /></button>
                  <button type="button" className="secondary-button" onClick={() => {
                    const current = new Date();
                    const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);
                    setCalendarMonth(currentMonth);
                    setSelectedDate(localDate(current));
                    void loadSite(selectedSiteId, userId, currentMonth);
                  }}>Aujourd’hui</button>
                  <button type="button" className="icon-button" onClick={() => void moveMonth(1)} aria-label="Mois suivant"><Icon name="chevronRight" /></button>
                </div>
              </div>

              <div className="work-calendar">
                {weekDays.map((day) => <div className="work-calendar__weekday" key={day}>{day}</div>)}
                {cells.map((cell) => {
                  const day = workDays.find((item) => item.work_date === cell.key);
                  const amount = amountByDate.get(cell.key) ?? 0;
                  return (
                    <button
                      type="button"
                      key={cell.key}
                      className={`work-calendar__day ${!cell.inMonth ? "work-calendar__day--outside" : ""} ${selectedDate === cell.key ? "work-calendar__day--selected" : ""} ${cell.key === todayKey ? "work-calendar__day--today" : ""}`}
                      onClick={() => setSelectedDate(cell.key)}
                    >
                      <strong>{cell.date.getDate()}</strong>
                      {day?.submitted_at && <span className={`attendance-badge attendance-badge--${day.day_type}`}>{dayTypeLabel(day.day_type)}</span>}
                      {amount > 0 && <span className="calendar-day-amount">{formatCurrency(amount)}</span>}
                      <div className="calendar-day-dots">
                        {day?.submitted_at ? <i className="calendar-dot calendar-dot--validated" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="panel selected-day-panel provider-declaration-panel">
              <div className="panel__header portal-panel__header">
                <div>
                  <span className="panel__eyebrow">Déclaration</span>
                  <h2>{dateLongLabel(selectedDate)}</h2>
                </div>
                {selectedWorkDay?.submitted_at && <span className="status-pill status-pill--active"><i />Enregistrée</span>}
              </div>
              <div className="provider-declaration-body">
                <div className="attendance-choice-grid">
                  {(["full", "half", "absent"] as WorkDayType[]).map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={`attendance-choice ${declarationType === type ? "attendance-choice--active" : ""} attendance-choice--${type}`}
                      onClick={() => setDeclarationType(type)}
                      disabled={selectedDateIsFuture}
                    >
                      <Icon name={type === "absent" ? "close" : type === "half" ? "clock" : "check"} size={18} />
                      <strong>{dayTypeLabel(type)}</strong>
                      <span>{type === "full" ? "100 % du forfait" : type === "half" ? "50 % du forfait" : "0 €"}</span>
                    </button>
                  ))}
                </div>

                <label className="field-group provider-note-field">
                  <span>Note facultative</span>
                  <textarea
                    value={declarationNote}
                    onChange={(event) => setDeclarationNote(event.target.value)}
                    placeholder="Ex. remplacement, rendez-vous, justification d’absence…"
                    rows={4}
                    disabled={selectedDateIsFuture}
                  />
                </label>

                <div className="selected-day-summary">
                  <div><span>Horaires pointés</span><strong>{timeLabel(selectedWorkDay?.started_at ?? null)} → {timeLabel(selectedWorkDay?.ended_at ?? null)}</strong></div>
                  <div><span>Durée</span><strong>{durationLabel(selectedWorkDay)}</strong></div>
                  <div><span>CA enregistré</span><strong>{formatCurrency(amountByDate.get(selectedDate) ?? 0)}</strong></div>
                </div>

                {selectedDateIsFuture ? (
                  <div className="page-alert"><Icon name="calendar" size={17} />Les journées futures ne peuvent pas encore être déclarées.</div>
                ) : (
                  <button type="button" className="primary-button declaration-submit" onClick={() => void declareDay()} disabled={actionLoading !== ""}>
                    <Icon name="check" size={18} /> {actionLoading === "declare" ? "Enregistrement…" : selectedWorkDay?.submitted_at ? "Modifier cette journée" : "Enregistrer cette journée"}
                  </button>
                )}
              </div>
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
                    <div className="portal-contract__highlight"><span>Net journée complète</span><strong>{formatCurrency(estimatedDayAmount)}</strong></div>
                    <div><span>Net demi-journée</span><strong>{formatCurrency(estimatedDayAmount / 2)}</strong></div>
                  </>
                ) : contract ? (
                  <>
                    <div><span>VO</span><strong>{formatCurrency(numeric(contract.vo_rate))}</strong></div>
                    <div><span>VN</span><strong>{formatCurrency(numeric(contract.vn_rate))}</strong></div>
                    <div><span>Relavage</span><strong>{formatCurrency(numeric(contract.relavage_rate))}</strong></div>
                    <div><span>Très sale</span><strong>{formatCurrency(numeric(contract.tres_sale_rate))}</strong></div>
                  </>
                ) : <p className="portal-muted-copy">Aucun contrat actif n’a été trouvé pour cette concession.</p>}
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
                    {contract?.payment_mode === "vehicle" && <span className="neutral-tag">{vehicle.billing_type.replace("tres_sale", "Très sale").toUpperCase()}</span>}
                    <b>{vehicle.status === "done" ? "Terminé" : vehicle.status === "washing" ? "En lavage" : "À laver"}</b>
                  </div>
                )) : <div className="portal-list-empty"><Icon name="car" size={25} /><strong>Aucun véhicule pris en charge</strong><span>Ouvre le tableau des véhicules pour commencer une prestation.</span></div>}
              </div>
            </article>
          </section>

          <section className="panel portal-panel portal-history-panel">
            <div className="panel__header portal-panel__header">
              <div><span className="panel__eyebrow">Suivi mensuel</span><h2>Mes journées et mon CA</h2></div>
              <strong>{formatCurrency(monthRevenue)}</strong>
            </div>
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead><tr><th>Date</th><th>Déclaration</th><th>Horaires</th><th>Validation</th><th>CA</th></tr></thead>
                <tbody>
                  {workDays.length ? [...workDays].reverse().map((day) => (
                    <tr key={day.id}>
                      <td><strong>{dateLabel(day.work_date)}</strong></td>
                      <td><span className={`attendance-badge attendance-badge--${day.day_type}`}>{dayTypeLabel(day.day_type)}</span></td>
                      <td>{timeLabel(day.started_at)} → {timeLabel(day.ended_at)}</td>
                      <td>{day.submitted_at ? <span className="status-pill status-pill--active"><i />Enregistrée</span> : <span className="status-pill">Brouillon</span>}</td>
                      <td><strong>{formatCurrency(amountByDate.get(day.work_date) ?? 0)}</strong></td>
                    </tr>
                  )) : <tr><td colSpan={5}><div className="portal-table-empty">Aucune journée déclarée pour ce mois.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
