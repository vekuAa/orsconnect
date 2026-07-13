"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";
import { StatCard } from "./stat-card";

interface ConcessionRow {
  id: string;
  name: string;
  city: string;
  daily_target: number;
}

interface VehicleRow {
  id: string;
  plate: string;
  model: string | null;
  status: "waiting" | "washing" | "done" | "cancelled";
  urgent: boolean;
  customer_waiting: boolean;
  concession_id: string;
  completed_at: string | null;
  updated_at: string;
}

interface FinanceRow {
  provider_id: string | null;
  concession_id: string;
  work_day_id: string | null;
  entry_date: string;
  source: "vehicle" | "day" | "concession_day" | "adjustment";
  billed_amount: number | string;
  provider_amount: number | string;
  operational_fees: number | string;
}

type WorkDayType = "full" | "half" | "absent";

interface WorkDayRow {
  id: string;
  provider_id: string;
  concession_id: string;
  work_date: string;
  started_at: string | null;
  ended_at: string | null;
  validated_by: string | null;
  day_type: WorkDayType;
  submitted_at: string | null;
}

interface ProviderRow {
  id: string;
  full_name: string;
}

const monthLabels = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

function dayTypeLabel(type: WorkDayType) {
  if (type === "half") return "Demi-journée";
  if (type === "absent") return "Absent";
  return "Journée complète";
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parisDate(date = new Date()) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DashboardContent() {
  const supabase = useMemo(() => createClient(), []);
  const [concessions, setConcessions] = useState<ConcessionRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [workDays, setWorkDays] = useState<WorkDayRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startYear = new Date(
      startToday.getFullYear(),
      startToday.getMonth() - 11,
      1,
    );
    const monthStart = `${parisDate().slice(0, 7)}-01`;

    const [
      concessionsResult,
      vehiclesResult,
      financeResult,
      workDaysResult,
      providersResult,
    ] = await Promise.all([
      supabase
        .from("concessions")
        .select("id, name, city, daily_target")
        .eq("active", true)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("vehicles")
        .select(
          "id, plate, model, status, urgent, customer_waiting, concession_id, completed_at, updated_at",
        )
        .neq("status", "cancelled")
        .gte("created_at", startToday.toISOString())
        .order("updated_at", { ascending: false }),
      supabase
        .from("financial_entries")
        .select(
          "provider_id, concession_id, work_day_id, entry_date, source, billed_amount, provider_amount, operational_fees",
        )
        .gte("entry_date", startYear.toISOString().slice(0, 10)),
      supabase
        .from("work_days")
        .select(
          "id, provider_id, concession_id, work_date, started_at, ended_at, validated_by, day_type, submitted_at",
        )
        .gte("work_date", monthStart)
        .order("work_date", { ascending: false })
        .order("started_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "prestataire")
        .order("full_name"),
    ]);

    const firstError =
      concessionsResult.error ??
      vehiclesResult.error ??
      financeResult.error ??
      workDaysResult.error ??
      providersResult.error;

    if (firstError) setError(firstError.message);

    setConcessions((concessionsResult.data ?? []) as ConcessionRow[]);
    setVehicles((vehiclesResult.data ?? []) as VehicleRow[]);
    setFinanceRows((financeResult.data ?? []) as FinanceRow[]);
    setWorkDays((workDaysResult.data ?? []) as WorkDayRow[]);
    setProviders((providersResult.data ?? []) as ProviderRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();

    const vehicleChannel = supabase
      .channel("dashboard-vehicles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        () => void load(),
      )
      .subscribe();

    const workDayChannel = supabase
      .channel("dashboard-work-days")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_days" },
        () => void load(),
      )
      .subscribe();

    const financeChannel = supabase
      .channel("dashboard-finance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_entries" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(vehicleChannel);
      void supabase.removeChannel(workDayChannel);
      void supabase.removeChannel(financeChannel);
    };
  }, [load, supabase]);

  const todayKey = parisDate();
  const done = vehicles.filter((vehicle) => vehicle.status === "done").length;
  const washing = vehicles.filter(
    (vehicle) => vehicle.status === "washing",
  ).length;
  const waiting = vehicles.filter(
    (vehicle) => vehicle.status === "waiting",
  ).length;
  const total = vehicles.length;
  const totalTarget = concessions.reduce(
    (sum, concession) => sum + concession.daily_target,
    0,
  );

  const todayFinance = useMemo(() => {
    const rows = financeRows.filter((row) => row.entry_date === todayKey);
    const billed = rows.reduce(
      (sum, row) => sum + numberValue(row.billed_amount),
      0,
    );
    const providerCost = rows.reduce(
      (sum, row) => sum + numberValue(row.provider_amount),
      0,
    );
    const fees = rows.reduce(
      (sum, row) => sum + numberValue(row.operational_fees),
      0,
    );
    return { billed, providerCost, margin: billed - providerCost - fees };
  }, [financeRows, todayKey]);

  const chart = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - 11 + index,
        1,
      );
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const value = financeRows
        .filter((row) => row.entry_date.startsWith(key))
        .reduce((sum, row) => sum + numberValue(row.billed_amount), 0);
      return { label: monthLabels[date.getMonth()], value };
    });
  }, [financeRows]);

  const providerNames = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider.full_name])),
    [providers],
  );
  const concessionNames = useMemo(
    () =>
      new Map(
        concessions.map((concession) => [concession.id, concession.name]),
      ),
    [concessions],
  );

  const recordedWorkDays = useMemo(
    () =>
      workDays
        .filter((day) => day.submitted_at)
        .map((day) => {
          const amount = financeRows
            .filter(
              (entry) =>
                entry.provider_id === day.provider_id &&
                entry.concession_id === day.concession_id &&
                entry.entry_date === day.work_date,
            )
            .reduce(
              (sum, entry) => sum + numberValue(entry.provider_amount),
              0,
            );
          return {
            ...day,
            amount,
            providerName:
              providerNames.get(day.provider_id) ?? "Prestataire supprimé",
            concessionName:
              concessionNames.get(day.concession_id) ?? "Concession archivée",
          };
        })
        .sort((a, b) =>
          `${b.work_date}${b.started_at ?? ""}`.localeCompare(
            `${a.work_date}${a.started_at ?? ""}`,
          ),
        ),
    [concessionNames, financeRows, providerNames, workDays],
  );

  const undeclaredWorkDays = workDays.filter((day) => !day.submitted_at);
  const fullWorkDays = workDays.filter((day) => day.submitted_at && day.day_type === "full").length;
  const halfWorkDays = workDays.filter((day) => day.submitted_at && day.day_type === "half").length;
  const absentWorkDays = workDays.filter((day) => day.submitted_at && day.day_type === "absent").length;
  const recordedMonthAmount = recordedWorkDays.reduce(
    (sum, day) => sum + day.amount,
    0,
  );

  const maxChart = Math.max(1, ...chart.map((item) => item.value));
  const annualBilled = chart.reduce((sum, item) => sum + item.value, 0);
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow={today}
        title="Bonjour 👋"
        description="Suivez le chiffre d’affaires, les journées enregistrées automatiquement et l’activité opérationnelle."
        actions={
          <Link href="/vehicles" className="primary-button">
            <Icon name="plus" size={18} /> Nouveau véhicule
          </Link>
        }
      />

      {error && (
        <div className="page-alert page-alert--error">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      <section className="stats-grid">
        <StatCard
          label="Véhicules traités"
          value={loading ? "—" : `${done}`}
          detail={`${washing} en cours · ${waiting} en attente`}
          icon="car"
          tone="blue"
        />
        <StatCard
          label="Chiffre d’affaires"
          value={formatCurrency(todayFinance.billed)}
          detail="Écritures du jour"
          icon="wallet"
          tone="green"
        />
        <StatCard
          label="Marge brute ORS"
          value={formatCurrency(todayFinance.margin)}
          detail={
            todayFinance.billed > 0
              ? `${Math.round((todayFinance.margin / todayFinance.billed) * 100)}% du CA journalier`
              : "Aucun CA enregistré aujourd’hui"
          }
          icon="trend"
          tone="violet"
        />
        <StatCard
          label="Journées non déclarées"
          value={`${undeclaredWorkDays.length}`}
          detail={`${fullWorkDays} complets · ${halfWorkDays} demi · ${absentWorkDays} absences`}
          icon="calendar"
          tone="amber"
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel revenue-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Performance réelle</span>
              <h2>Chiffre d’affaires sur 12 mois</h2>
            </div>
          </div>
          <div className="chart-summary">
            <div>
              <strong>{formatCurrency(annualBilled)}</strong>
              <span>sur la période</span>
            </div>
          </div>
          <div className="bar-chart" aria-label="Évolution du chiffre d’affaires">
            {chart.map((item) => (
              <div
                className="bar-chart__item"
                key={`${item.label}-${item.value}`}
              >
                <div className="bar-chart__track">
                  <i
                    style={{
                      height: `${Math.round((item.value / maxChart) * 100)}%`,
                    }}
                  />
                </div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel production-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Production du jour</span>
              <h2>Flux des véhicules</h2>
            </div>
            <Link href="/vehicles" className="text-link">
              Voir le détail <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: total
                  ? `conic-gradient(var(--green) 0 ${(done / total) * 100}%, var(--blue) ${(done / total) * 100}% ${((done + washing) / total) * 100}%, var(--amber) ${((done + washing) / total) * 100}% 100%)`
                  : undefined,
              }}
            >
              <div>
                <strong>{total}</strong>
                <span>véhicules</span>
              </div>
            </div>
            <div className="donut-legend">
              <div>
                <i className="legend-dot legend-dot--green" />
                <span>Lavés</span>
                <strong>{done}</strong>
              </div>
              <div>
                <i className="legend-dot legend-dot--blue" />
                <span>En lavage</span>
                <strong>{washing}</strong>
              </div>
              <div>
                <i className="legend-dot legend-dot--amber" />
                <span>À laver</span>
                <strong>{waiting}</strong>
              </div>
            </div>
          </div>
          <div className="objective-progress">
            <div>
              <span>Objectif journalier</span>
              <strong>
                {totalTarget ? Math.round((done / totalTarget) * 100) : 0}%
              </strong>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: `${totalTarget ? Math.min(100, (done / totalTarget) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </article>
      </section>

      <section className="panel validated-days-panel">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Suivi prestataires</span>
            <h2>Journées enregistrées ce mois</h2>
          </div>
          <div className="validated-days-summary">
            <span>{recordedWorkDays.length} journée(s)</span>
            <strong>{formatCurrency(recordedMonthAmount)}</strong>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Prestataire</th>
                <th>Concession</th>
                <th>Déclaration</th>
                <th>Horaires</th>
                <th>Montant</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {recordedWorkDays.length ? (
                recordedWorkDays.slice(0, 12).map((day) => (
                  <tr key={day.id}>
                    <td>
                      <strong>
                        {new Date(`${day.work_date}T12:00:00`).toLocaleDateString(
                          "fr-FR",
                        )}
                      </strong>
                    </td>
                    <td>{day.providerName}</td>
                    <td>{day.concessionName}</td>
                    <td>
                      <span className={`attendance-badge attendance-badge--${day.day_type}`}>
                        {dayTypeLabel(day.day_type)}
                      </span>
                    </td>
                    <td>
                      {timeLabel(day.started_at)} → {timeLabel(day.ended_at)}
                    </td>
                    <td>
                      <strong>{formatCurrency(day.amount)}</strong>
                    </td>
                    <td>
                      <span className="status-pill status-pill--active">
                        <i /> Enregistrée
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="portal-table-empty">
                      Aucune journée enregistrée pour le moment.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--bottom">
        <article className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Sites actifs</span>
              <h2>Performance des concessions</h2>
            </div>
            <Link href="/concessions" className="text-link">
              Toutes les concessions <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="concession-list">
            {concessions.length ? (
              concessions.map((concession, index) => {
                const completed = vehicles.filter(
                  (vehicle) =>
                    vehicle.concession_id === concession.id &&
                    vehicle.status === "done",
                ).length;
                const percent = Math.min(
                  100,
                  Math.round((completed / concession.daily_target) * 100),
                );
                return (
                  <div className="concession-row" key={concession.id}>
                    <div className="concession-row__rank">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="concession-row__identity">
                      <strong>{concession.name}</strong>
                      <span>{concession.city}</span>
                    </div>
                    <div className="concession-row__progress">
                      <div>
                        <span>Objectif</span>
                        <strong>{percent}%</strong>
                      </div>
                      <div className="progress-track progress-track--small">
                        <i style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                    <strong className="concession-row__count">
                      {completed} <small>/ {concession.daily_target}</small>
                    </strong>
                  </div>
                );
              })
            ) : (
              <div className="empty-column">
                <strong>Aucune concession active</strong>
              </div>
            )}
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Temps réel</span>
              <h2>Activité récente</h2>
            </div>
            <span className="live-label">
              <i /> En direct
            </span>
          </div>
          <div className="activity-list">
            {vehicles.slice(0, 5).map((vehicle) => (
              <div className="activity-item" key={vehicle.id}>
                <span
                  className={`activity-icon activity-icon--${vehicle.status === "done" ? "green" : vehicle.status === "washing" ? "blue" : "amber"}`}
                >
                  <Icon
                    name={
                      vehicle.status === "done"
                        ? "check"
                        : vehicle.status === "washing"
                          ? "car"
                          : vehicle.urgent
                            ? "warning"
                            : "clock"
                    }
                    size={16}
                  />
                </span>
                <div>
                  <strong>
                    {vehicle.plate} ·{" "}
                    {vehicle.status === "done"
                      ? "terminé"
                      : vehicle.status === "washing"
                        ? "en lavage"
                        : "à laver"}
                  </strong>
                  <p>
                    {vehicle.model || "Modèle non précisé"}
                    {vehicle.customer_waiting ? " · client sur place" : ""}
                  </p>
                </div>
                <time>
                  {new Date(vehicle.updated_at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
            {!vehicles.length && (
              <div className="empty-column">
                <strong>Aucune activité aujourd’hui</strong>
                <span>Ajoutez le premier véhicule.</span>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
