"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type { Role } from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";
import styles from "./finances-content.module.css";

type FinanceSource = "vehicle" | "day" | "concession_day" | "adjustment";

interface FinanceRow {
  id: string;
  concession_id: string;
  provider_id: string | null;
  vehicle_id: string | null;
  work_day_id: string | null;
  entry_date: string;
  billed_amount: number | string;
  provider_amount: number | string;
  operational_fees: number | string;
  source: FinanceSource;
  description: string | null;
  created_at: string;
}

interface ConcessionRow {
  id: string;
  organization_id: string;
  name: string;
  city: string;
  archived_at: string | null;
}

interface ProviderRow {
  id: string;
  full_name: string;
  archived_at: string | null;
}

interface WorkDayRow {
  id: string;
  provider_id: string;
  concession_id: string;
  work_date: string;
  validated_by: string | null;
}

interface ProfileRow {
  id: string;
  organization_id: string;
  role: Role;
}

const PAGE_SIZE = 1000;

const sourceLabels: Record<FinanceSource, string> = {
  vehicle: "Véhicule",
  day: "Forfait prestataire",
  concession_day: "Forfait concession",
  adjustment: "Ajustement",
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function percent(value: number) {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function csvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

async function fetchFinanceRows(
  supabase: ReturnType<typeof createClient>,
  startDate: string,
) {
  const rows: FinanceRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("financial_entries")
      .select(
        "id, concession_id, provider_id, vehicle_id, work_day_id, entry_date, billed_amount, provider_amount, operational_fees, source, description, created_at",
      )
      .gte("entry_date", startDate)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as FinanceRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchWorkDays(
  supabase: ReturnType<typeof createClient>,
  startDate: string,
) {
  const rows: WorkDayRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("work_days")
      .select("id, provider_id, concession_id, work_date, validated_by")
      .gte("work_date", startDate)
      .order("work_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as WorkDayRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function AdjustmentModal({
  concessions,
  organizationId,
  defaultDate,
  onClose,
  onCreated,
}: {
  concessions: ConcessionRow[];
  organizationId: string;
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mounted, setMounted] = useState(false);
  const [concessionId, setConcessionId] = useState(concessions[0]?.id ?? "");
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [billed, setBilled] = useState(0);
  const [providerAmount, setProviderAmount] = useState(0);
  const [fees, setFees] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!concessionId || !description.trim()) {
      setError("La concession et le libellé sont obligatoires.");
      return;
    }

    setSaving(true);
    setError("");
    const { error: insertError } = await supabase.from("financial_entries").insert({
      organization_id: organizationId,
      concession_id: concessionId,
      entry_date: entryDate,
      billed_amount: billed,
      provider_amount: providerAmount,
      operational_fees: fees,
      source: "adjustment",
      description: description.trim(),
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    onCreated();
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="adjustment-title">
        <div className="modal__header">
          <div>
            <span className="page-eyebrow">Écriture manuelle</span>
            <h2 id="adjustment-title">Ajouter un ajustement</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="field-group">
              <span>Concession</span>
              <select value={concessionId} onChange={(event) => setConcessionId(event.target.value)} required>
                {concessions.map((concession) => (
                  <option value={concession.id} key={concession.id}>
                    {concession.name} · {concession.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span>Date</span>
              <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required />
            </label>
            <label className="field-group field-group--full">
              <span>Libellé</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex. frais de déplacement, correction de facturation…" required />
            </label>
            <label className="field-group">
              <span>Facturation client</span>
              <input type="number" step="0.01" value={billed} onChange={(event) => setBilled(Number(event.target.value))} />
            </label>
            <label className="field-group">
              <span>Rémunération prestataire</span>
              <input type="number" step="0.01" value={providerAmount} onChange={(event) => setProviderAmount(Number(event.target.value))} />
            </label>
            <label className="field-group">
              <span>Frais opérationnels</span>
              <input type="number" step="0.01" value={fees} onChange={(event) => setFees(Number(event.target.value))} />
            </label>
          </div>
          <p className={styles.adjustmentHint}>
            Les montants négatifs permettent de corriger une écriture précédente sans supprimer l’historique.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="modal__footer">
            <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary-button" disabled={saving}>
              <Icon name="plus" size={17} /> {saving ? "Enregistrement…" : "Enregistrer l’ajustement"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function FinancesContent() {
  const supabase = useMemo(() => createClient(), []);
  const initialized = useRef(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [entries, setEntries] = useState<FinanceRow[]>([]);
  const [concessions, setConcessions] = useState<ConcessionRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [workDays, setWorkDays] = useState<WorkDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showAdjustment, setShowAdjustment] = useState(false);

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      return monthKey(date);
    });
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [selectedConcession, setSelectedConcession] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [selectedSource, setSelectedSource] = useState<"all" | FinanceSource>("all");

  const load = useCallback(async () => {
    if (initialized.current) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Session expirée.");

      const oldestMonth = monthOptions.at(-1) ?? monthOptions[0];
      const startDate = `${oldestMonth}-01`;

      const [profileResult, concessionsResult, providersResult, financeRows, dayRows] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, organization_id, role")
          .eq("id", authData.user.id)
          .single(),
        supabase
          .from("concessions")
          .select("id, organization_id, name, city, archived_at")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, archived_at")
          .eq("role", "prestataire")
          .order("full_name"),
        fetchFinanceRows(supabase, startDate),
        fetchWorkDays(supabase, startDate),
      ]);

      const firstError = profileResult.error ?? concessionsResult.error ?? providersResult.error;
      if (firstError) throw firstError;

      setProfile(profileResult.data as ProfileRow);
      setConcessions((concessionsResult.data ?? []) as ConcessionRow[]);
      setProviders((providersResult.data ?? []) as ProviderRow[]);
      setEntries(financeRows);
      setWorkDays(dayRows);
      initialized.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement financier impossible.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [monthOptions, supabase]);

  useEffect(() => {
    void load();

    const financeChannel = supabase
      .channel("finance-page-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries" }, () => void load())
      .subscribe();
    const daysChannel = supabase
      .channel("finance-page-days")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_days" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(financeChannel);
      void supabase.removeChannel(daysChannel);
    };
  }, [load, supabase]);

  const concessionNames = useMemo(
    () => new Map(concessions.map((row) => [row.id, `${row.name} · ${row.city}`])),
    [concessions],
  );
  const providerNames = useMemo(
    () => new Map(providers.map((row) => [row.id, row.full_name])),
    [providers],
  );

  const matchesFiltersWithoutMonth = useCallback((row: FinanceRow) => {
    if (selectedConcession !== "all" && row.concession_id !== selectedConcession) return false;
    if (selectedProvider !== "all" && row.provider_id !== selectedProvider) return false;
    if (selectedSource !== "all" && row.source !== selectedSource) return false;
    return true;
  }, [selectedConcession, selectedProvider, selectedSource]);

  const filteredEntries = useMemo(
    () => entries.filter((row) => row.entry_date.startsWith(selectedMonth) && matchesFiltersWithoutMonth(row)),
    [entries, matchesFiltersWithoutMonth, selectedMonth],
  );

  const previousMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return monthKey(new Date(year, month - 2, 1));
  }, [selectedMonth]);

  const summarize = useCallback((rows: FinanceRow[]) => {
    const billed = rows.reduce((sum, row) => sum + numberValue(row.billed_amount), 0);
    const providerCost = rows.reduce((sum, row) => sum + numberValue(row.provider_amount), 0);
    const fees = rows.reduce((sum, row) => sum + numberValue(row.operational_fees), 0);
    const margin = billed - providerCost - fees;
    return {
      billed,
      providerCost,
      fees,
      margin,
      marginRate: billed === 0 ? 0 : (margin / billed) * 100,
    };
  }, []);

  const summary = useMemo(() => summarize(filteredEntries), [filteredEntries, summarize]);
  const previousSummary = useMemo(
    () => summarize(entries.filter((row) => row.entry_date.startsWith(previousMonth) && matchesFiltersWithoutMonth(row))),
    [entries, matchesFiltersWithoutMonth, previousMonth, summarize],
  );

  const billedEvolution = previousSummary.billed === 0
    ? null
    : ((summary.billed - previousSummary.billed) / Math.abs(previousSummary.billed)) * 100;

  const filteredWorkDays = useMemo(
    () => workDays.filter((day) => {
      if (!day.work_date.startsWith(selectedMonth)) return false;
      if (selectedConcession !== "all" && day.concession_id !== selectedConcession) return false;
      if (selectedProvider !== "all" && day.provider_id !== selectedProvider) return false;
      return true;
    }),
    [selectedConcession, selectedMonth, selectedProvider, workDays],
  );

  const validatedDays = filteredWorkDays.filter((day) => day.validated_by).length;
  const pendingDays = filteredWorkDays.filter((day) => !day.validated_by).length;

  const monthlyHistory = useMemo(() => [...monthOptions].reverse().map((key) => {
    const monthRows = entries.filter((row) => row.entry_date.startsWith(key) && matchesFiltersWithoutMonth(row));
    return { key, ...summarize(monthRows) };
  }), [entries, matchesFiltersWithoutMonth, monthOptions, summarize]);

  const maxMonthlyBilled = Math.max(1, ...monthlyHistory.map((row) => Math.abs(row.billed)));

  const concessionBreakdown = useMemo(() => {
    const map = new Map<string, FinanceRow[]>();
    filteredEntries.forEach((row) => {
      map.set(row.concession_id, [...(map.get(row.concession_id) ?? []), row]);
    });
    return [...map.entries()]
      .map(([id, rows]) => ({
        id,
        name: concessionNames.get(id) ?? "Concession archivée",
        ...summarize(rows),
      }))
      .sort((a, b) => b.billed - a.billed);
  }, [concessionNames, filteredEntries, summarize]);

  const providerBreakdown = useMemo(() => {
    const map = new Map<string, FinanceRow[]>();
    filteredEntries.forEach((row) => {
      if (!row.provider_id || numberValue(row.provider_amount) === 0) return;
      map.set(row.provider_id, [...(map.get(row.provider_id) ?? []), row]);
    });

    return [...map.entries()]
      .map(([id, rows]) => ({
        id,
        name: providerNames.get(id) ?? "Prestataire archivé",
        amount: rows.reduce((sum, row) => sum + numberValue(row.provider_amount), 0),
        validatedDays: filteredWorkDays.filter((day) => day.provider_id === id && day.validated_by).length,
        vehicleEntries: rows.filter((row) => row.source === "vehicle" && numberValue(row.provider_amount) !== 0).length,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredEntries, filteredWorkDays, providerNames]);

  const exportCsv = () => {
    const header = [
      "Date",
      "Concession",
      "Prestataire",
      "Source",
      "Description",
      "Facturé",
      "Rémunération prestataire",
      "Frais",
      "Marge",
    ];
    const lines = filteredEntries.map((row) => {
      const billed = numberValue(row.billed_amount);
      const provider = numberValue(row.provider_amount);
      const fees = numberValue(row.operational_fees);
      return [
        row.entry_date,
        concessionNames.get(row.concession_id) ?? "Concession archivée",
        row.provider_id ? providerNames.get(row.provider_id) ?? "Prestataire archivé" : "",
        sourceLabels[row.source],
        row.description ?? "",
        billed.toFixed(2),
        provider.toFixed(2),
        fees.toFixed(2),
        (billed - provider - fees).toFixed(2),
      ];
    });

    const csv = `\uFEFF${[header, ...lines].map((row) => row.map(csvCell).join(";")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ors-finances-${selectedMonth}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const today = new Date();
  const defaultAdjustmentDate = selectedMonth === monthKey(today)
    ? `${monthKey(today)}-${String(today.getDate()).padStart(2, "0")}`
    : `${selectedMonth}-01`;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage économique"
        title="Finances"
        description="Suivez la facturation concession, les rémunérations validées, les frais et la marge réelle ORS."
        actions={
          <div className={styles.headerActions}>
            {profile?.role === "admin" && (
              <button type="button" className="secondary-button" onClick={() => setShowAdjustment(true)} disabled={!concessions.length}>
                <Icon name="plus" size={17} /> Ajustement
              </button>
            )}
            <button type="button" className="secondary-button" onClick={exportCsv} disabled={!filteredEntries.length}>
              <Icon name="download" size={17} /> Exporter en CSV
            </button>
          </div>
        }
      />

      {error && <div className="form-error">{error}</div>}

      <section className={styles.filters}>
        <label>
          <span>Période</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {monthOptions.map((key) => <option value={key} key={key}>{monthLabel(key)}</option>)}
          </select>
        </label>
        <label>
          <span>Concession</span>
          <select value={selectedConcession} onChange={(event) => setSelectedConcession(event.target.value)}>
            <option value="all">Toutes les concessions</option>
            {concessions.map((row) => (
              <option value={row.id} key={row.id}>{row.name} · {row.city}{row.archived_at ? " · archivée" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Prestataire</span>
          <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)}>
            <option value="all">Tous les prestataires</option>
            {providers.map((row) => (
              <option value={row.id} key={row.id}>{row.full_name}{row.archived_at ? " · archivé" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Type d’écriture</span>
          <select value={selectedSource} onChange={(event) => setSelectedSource(event.target.value as "all" | FinanceSource)}>
            <option value="all">Toutes les écritures</option>
            {Object.entries(sourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={refreshing}>
          <Icon name="trend" size={16} /> {refreshing ? "Actualisation…" : "Actualiser"}
        </button>
      </section>

      {loading ? (
        <section className={styles.loadingPanel}>Chargement des données financières…</section>
      ) : (
        <>
          <section className={styles.kpis}>
            <article className={styles.kpi}>
              <span className={`${styles.kpiIcon} ${styles.blue}`}><Icon name="wallet" /></span>
              <div><small>CA facturé</small><strong>{formatCurrency(summary.billed)}</strong><p>{billedEvolution === null ? "Pas de comparaison disponible" : `${billedEvolution >= 0 ? "+" : ""}${percent(billedEvolution)} vs mois précédent`}</p></div>
            </article>
            <article className={styles.kpi}>
              <span className={`${styles.kpiIcon} ${styles.violet}`}><Icon name="users" /></span>
              <div><small>Rémunérations prestataires</small><strong>{formatCurrency(summary.providerCost)}</strong><p>{validatedDays} journée{validatedDays > 1 ? "s" : ""} validée{validatedDays > 1 ? "s" : ""}</p></div>
            </article>
            <article className={styles.kpi}>
              <span className={`${styles.kpiIcon} ${styles.amber}`}><Icon name="chart" /></span>
              <div><small>Frais opérationnels</small><strong>{formatCurrency(summary.fees)}</strong><p>{pendingDays} journée{pendingDays > 1 ? "s" : ""} encore en attente</p></div>
            </article>
            <article className={`${styles.kpi} ${styles.marginKpi}`}>
              <span className={`${styles.kpiIcon} ${styles.green}`}><Icon name="trend" /></span>
              <div><small>Marge brute ORS</small><strong className={summary.margin < 0 ? styles.negative : ""}>{formatCurrency(summary.margin)}</strong><p>{percent(summary.marginRate)} du CA facturé</p></div>
            </article>
          </section>

          <section className={styles.mainGrid}>
            <article className={`panel ${styles.historyPanel}`}>
              <div className="panel__header">
                <div><span className="panel__eyebrow">Évolution</span><h2>CA et marge sur 12 mois</h2></div>
                <span className={styles.liveBadge}><i /> Données Supabase</span>
              </div>
              <div className={styles.chart}>
                {monthlyHistory.map((row) => {
                  const billedHeight = Math.max(3, Math.abs(row.billed) / maxMonthlyBilled * 100);
                  const marginHeight = Math.max(0, Math.abs(row.margin) / maxMonthlyBilled * 100);
                  return (
                    <button type="button" className={`${styles.chartMonth} ${row.key === selectedMonth ? styles.chartMonthActive : ""}`} key={row.key} onClick={() => setSelectedMonth(row.key)} title={`${monthLabel(row.key)} : ${formatCurrency(row.billed)} facturés`}>
                      <span className={styles.chartBars}>
                        <i className={styles.billedBar} style={{ height: `${billedHeight}%` }} />
                        <i className={`${styles.marginBar} ${row.margin < 0 ? styles.negativeBar : ""}`} style={{ height: `${marginHeight}%` }} />
                      </span>
                      <strong>{row.key.slice(5)}</strong>
                    </button>
                  );
                })}
              </div>
              <div className={styles.legend}><span><i className={styles.billedLegend} /> CA facturé</span><span><i className={styles.marginLegend} /> Marge ORS</span></div>
            </article>

            <article className={`panel ${styles.daysPanel}`}>
              <div className="panel__header">
                <div><span className="panel__eyebrow">Contrôle</span><h2>Journées prestataires</h2></div>
                <Icon name="calendar" />
              </div>
              <div className={styles.dayCounters}>
                <div><span>Validées</span><strong>{validatedDays}</strong><small>Comptabilisées dans les rémunérations</small></div>
                <div><span>En attente</span><strong>{pendingDays}</strong><small>À terminer ou valider par la concession</small></div>
              </div>
              <p className={styles.controlNote}>
                Les forfaits journaliers prestataires n’entrent dans les finances qu’après validation de la journée. Les paiements à la voiture sont générés à la clôture de chaque véhicule.
              </p>
            </article>
          </section>

          <section className={styles.breakdownGrid}>
            <article className={`panel ${styles.tablePanel}`}>
              <div className="panel__header"><div><span className="panel__eyebrow">Rentabilité</span><h2>Par concession</h2></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Concession</th><th>Facturé</th><th>Coût</th><th>Marge</th><th>Taux</th></tr></thead>
                  <tbody>
                    {concessionBreakdown.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.name}</strong></td>
                        <td>{formatCurrency(row.billed)}</td>
                        <td>{formatCurrency(row.providerCost + row.fees)}</td>
                        <td className={row.margin < 0 ? styles.negative : styles.positive}>{formatCurrency(row.margin)}</td>
                        <td><span className={styles.ratePill}>{percent(row.marginRate)}</span></td>
                      </tr>
                    ))}
                    {!concessionBreakdown.length && <tr><td colSpan={5} className={styles.emptyCell}>Aucune écriture pour cette période.</td></tr>}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={`panel ${styles.tablePanel}`}>
              <div className="panel__header"><div><span className="panel__eyebrow">Rémunérations</span><h2>Par prestataire</h2></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Prestataire</th><th>Jours validés</th><th>Véhicules rémunérés</th><th>Montant</th></tr></thead>
                  <tbody>
                    {providerBreakdown.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.name}</strong></td>
                        <td>{row.validatedDays}</td>
                        <td>{row.vehicleEntries}</td>
                        <td className={styles.providerAmount}>{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                    {!providerBreakdown.length && <tr><td colSpan={4} className={styles.emptyCell}>Aucune rémunération enregistrée.</td></tr>}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className={`panel ${styles.entriesPanel}`}>
            <div className="panel__header">
              <div><span className="panel__eyebrow">Traçabilité</span><h2>Écritures de {monthLabel(selectedMonth)}</h2></div>
              <span className={styles.entryCount}>{filteredEntries.length} écriture{filteredEntries.length > 1 ? "s" : ""}</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Concession</th><th>Prestataire</th><th>Origine</th><th>Libellé</th><th>Facturé</th><th>Prestataire</th><th>Frais</th><th>Marge</th></tr></thead>
                <tbody>
                  {filteredEntries.map((row) => {
                    const billed = numberValue(row.billed_amount);
                    const providerAmount = numberValue(row.provider_amount);
                    const fees = numberValue(row.operational_fees);
                    const margin = billed - providerAmount - fees;
                    return (
                      <tr key={row.id}>
                        <td>{dateLabel(row.entry_date)}</td>
                        <td><strong>{concessionNames.get(row.concession_id) ?? "Concession archivée"}</strong></td>
                        <td>{row.provider_id ? providerNames.get(row.provider_id) ?? "Prestataire archivé" : "—"}</td>
                        <td><span className={`${styles.sourceBadge} ${styles[`source_${row.source}`]}`}>{sourceLabels[row.source]}</span></td>
                        <td>{row.description || "—"}</td>
                        <td>{formatCurrency(billed)}</td>
                        <td>{formatCurrency(providerAmount)}</td>
                        <td>{formatCurrency(fees)}</td>
                        <td className={margin < 0 ? styles.negative : styles.positive}>{formatCurrency(margin)}</td>
                      </tr>
                    );
                  })}
                  {!filteredEntries.length && <tr><td colSpan={9} className={styles.emptyCell}>Aucune écriture ne correspond aux filtres.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showAdjustment && profile && (
        <AdjustmentModal
          concessions={concessions.filter((row) => !row.archived_at)}
          organizationId={profile.organization_id}
          defaultDate={defaultAdjustmentDate}
          onClose={() => setShowAdjustment(false)}
          onCreated={() => void load()}
        />
      )}
    </>
  );
}
