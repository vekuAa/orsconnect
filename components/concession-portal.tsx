"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

interface Site {
  id: string;
  name: string;
  city: string;
  address: string;
  dailyTarget: number;
}

interface ProviderProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: "pending" | "active" | "inactive";
}

type WorkDayType = "full" | "half" | "absent";

interface WorkDay {
  id: string;
  provider_id: string;
  work_date: string;
  started_at: string | null;
  ended_at: string | null;
  validated_by: string | null;
  notes: string | null;
  day_type: WorkDayType;
  submitted_at: string | null;
}

interface VehicleRow {
  id: string;
  plate: string;
  model: string | null;
  status: "waiting" | "washing" | "done" | "cancelled";
  provider_id: string | null;
  return_time: string | null;
  urgent: boolean;
  customer_waiting: boolean;
  completed_at: string | null;
}

const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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

function dateLongLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dayTypeLabel(type: WorkDayType) {
  if (type === "half") return "Demi-journée";
  if (type === "absent") return "Absent";
  return "Journée complète";
}

function providerInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dayDuration(day: WorkDay | undefined) {
  if (!day?.started_at || !day.ended_at) return "—";
  const minutes = Math.max(
    0,
    Math.round(
      (new Date(day.ended_at).getTime() -
        new Date(day.started_at).getTime()) /
        60000,
    ),
  );
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
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

export function ConcessionPortal() {
  const supabase = useMemo(() => createClient(), []);
  const [managerName, setManagerName] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => localDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSite = useCallback(
    async (siteId: string, month: Date) => {
      if (!siteId) return;
      setError("");

      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const monthStart = `${monthKey(month)}-01`;
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const monthEnd = `${monthKey(nextMonth)}-01`;

      const [accessResult, workResult, vehicleResult] = await Promise.all([
        supabase
          .from("concession_access")
          .select("profile_id")
          .eq("concession_id", siteId),
        supabase
          .from("work_days")
          .select(
            "id, provider_id, work_date, started_at, ended_at, validated_by, notes, day_type, submitted_at",
          )
          .eq("concession_id", siteId)
          .gte("work_date", monthStart)
          .lt("work_date", monthEnd)
          .order("work_date", { ascending: true })
          .order("started_at", { ascending: true }),
        supabase
          .from("vehicles")
          .select(
            "id, plate, model, status, provider_id, return_time, urgent, customer_waiting, completed_at",
          )
          .eq("concession_id", siteId)
          .neq("status", "cancelled")
          .gte("created_at", startToday.toISOString())
          .order("created_at", { ascending: true }),
      ]);

      const firstError =
        accessResult.error ?? workResult.error ?? vehicleResult.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }

      const profileIds = [
        ...new Set(
          (accessResult.data ?? []).map((row) => row.profile_id as string),
        ),
      ];
      let providerRows: ProviderProfile[] = [];

      if (profileIds.length) {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, status")
          .in("id", profileIds)
          .eq("role", "prestataire")
          .is("archived_at", null)
          .order("full_name");

        if (profileError) {
          setError(profileError.message);
          return;
        }
        providerRows = (data as ProviderProfile[] | null) ?? [];
      }

      setProviders(providerRows);
      setWorkDays((workResult.data as WorkDay[] | null) ?? []);
      setVehicles((vehicleResult.data as VehicleRow[] | null) ?? []);
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

      const [profileResult, accessResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .single(),
        supabase
          .from("concession_access")
          .select("concession_id")
          .eq("profile_id", user.id),
      ]);

      if (!active) return;
      if (profileResult.error || accessResult.error || !profileResult.data) {
        setError(
          profileResult.error?.message ??
            accessResult.error?.message ??
            "Profil introuvable.",
        );
        setLoading(false);
        return;
      }

      if (profileResult.data.role !== "concession") {
        setError("Cette page est réservée aux responsables de concession.");
        setLoading(false);
        return;
      }

      const ids = (accessResult.data ?? []).map(
        (row) => row.concession_id as string,
      );
      let siteRows: Array<{
        id: string;
        name: string;
        city: string;
        address: string;
        daily_target: number;
      }> = [];

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

      const requested =
        new URLSearchParams(window.location.search).get("site") ?? "";
      const firstSiteId = mappedSites.some((site) => site.id === requested)
        ? requested
        : (mappedSites[0]?.id ?? "");

      setManagerName(profileResult.data.full_name);
      setSites(mappedSites);
      setSelectedSiteId(firstSiteId);
      if (firstSiteId) await loadSite(firstSiteId, calendarMonth);
      setLoading(false);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [loadSite, supabase]);

  useEffect(() => {
    if (!selectedSiteId) return;

    const vehicleChannel = supabase
      .channel(`concession-vehicles-${selectedSiteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicles",
          filter: `concession_id=eq.${selectedSiteId}`,
        },
        () => void loadSite(selectedSiteId, calendarMonth),
      )
      .subscribe();

    const dayChannel = supabase
      .channel(`concession-days-${selectedSiteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_days",
          filter: `concession_id=eq.${selectedSiteId}`,
        },
        () => void loadSite(selectedSiteId, calendarMonth),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(vehicleChannel);
      void supabase.removeChannel(dayChannel);
    };
  }, [calendarMonth, loadSite, selectedSiteId, supabase]);

  const changeSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    setLoading(true);
    await loadSite(siteId, calendarMonth);
    setLoading(false);
  };

  const moveMonth = async (offset: number) => {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1,
    );
    setCalendarMonth(next);
    const today = new Date();
    const initialDate =
      next.getFullYear() === today.getFullYear() &&
      next.getMonth() === today.getMonth()
        ? localDate(today)
        : localDate(next);
    setSelectedDate(initialDate);
    if (selectedSiteId) {
      setLoading(true);
      await loadSite(selectedSiteId, next);
      setLoading(false);
    }
  };

  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const waiting = vehicles.filter((vehicle) => vehicle.status === "waiting");
  const washing = vehicles.filter((vehicle) => vehicle.status === "washing");
  const done = vehicles.filter((vehicle) => vehicle.status === "done");
  const today = localDate();
  const todayDays = workDays.filter((day) => day.work_date === today);
  const activeWorkDays = todayDays.filter(
    (day) => day.started_at && !day.ended_at,
  );
  const declaredDays = workDays.filter((day) => day.submitted_at);
  const selectedDays = workDays.filter(
    (day) => day.work_date === selectedDate,
  );
  const progress = selectedSite?.dailyTarget
    ? Math.min(100, Math.round((done.length / selectedSite.dailyTarget) * 100))
    : 0;
  const cells = calendarCells(calendarMonth);

  if (loading) {
    return (
      <section className="panel loading-panel">
        <strong>Chargement de l’espace concession…</strong>
        <span>Synchronisation de l’équipe et du calendrier</span>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Espace concession"
        title={`Bonjour ${managerName.split(" ")[0] || ""}`.trim()}
        description="Suivez la production et les présences déclarées automatiquement par les prestataires."
        actions={
          selectedSite ? (
            <Link
              className="primary-button"
              href={`/vehicles?site=${selectedSite.id}`}
            >
              <Icon name="plus" size={18} /> Ajouter un véhicule
            </Link>
          ) : undefined
        }
      />

      {error && (
        <div className="page-alert page-alert--error">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      {!sites.length ? (
        <section className="panel portal-empty-state">
          <Icon name="building" size={32} />
          <h2>Aucune concession rattachée</h2>
          <p>Ce compte responsable n’est relié à aucun site actif.</p>
        </section>
      ) : (
        <>
          <section className="operations-strip portal-site-strip">
            <label className="operations-strip__site operations-site-select">
              <span className="site-icon">
                <Icon name="building" />
              </span>
              <div>
                <small>Site suivi</small>
                <select
                  value={selectedSiteId}
                  onChange={(event) => void changeSite(event.target.value)}
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} · {site.city}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <div className="operations-strip__metrics">
              <div>
                <span>Présents maintenant</span>
                <strong>{activeWorkDays.length}</strong>
              </div>
              <div>
                <span>Journées déclarées</span>
                <strong>{declaredDays.length}</strong>
              </div>
              <div className="metric-highlight">
                <span>Objectif du jour</span>
                <strong>{progress}%</strong>
              </div>
            </div>
          </section>

          <section className="portal-two-columns">
            <article className="panel portal-panel">
              <div className="panel__header portal-panel__header">
                <div>
                  <span className="panel__eyebrow">Équipe du jour</span>
                  <h2>Prestataires affectés</h2>
                </div>
              </div>
              <div className="portal-provider-list">
                {providers.length ? (
                  providers.map((provider) => {
                    const day = todayDays.find(
                      (item) => item.provider_id === provider.id,
                    );
                    return (
                      <div className="portal-provider-row" key={provider.id}>
                        <span className="provider-avatar">
                          {providerInitials(provider.full_name)}
                        </span>
                        <div>
                          <strong>{provider.full_name}</strong>
                          <small>
                            {day?.submitted_at
                              ? `${dayTypeLabel(day.day_type)} · ${timeLabel(day.started_at)} → ${timeLabel(day.ended_at)}`
                              : day?.started_at
                                ? `${timeLabel(day.started_at)} → ${timeLabel(day.ended_at)}`
                                : "Journée non déclarée"}
                          </small>
                        </div>
                        <div className="portal-provider-row__action">
                          {day?.submitted_at ? (
                            <span className="status-pill status-pill--active">
                              <i /> Déclarée
                            </span>
                          ) : (
                            <span className="status-pill">
                              {day?.started_at ? "En cours" : "Non déclarée"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="portal-list-empty">
                    <Icon name="users" size={25} />
                    <strong>Aucun prestataire affecté</strong>
                    <span>ORS doit rattacher un prestataire à ce site.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="panel portal-panel">
              <div className="panel__header portal-panel__header">
                <div>
                  <span className="panel__eyebrow">Suivi opérationnel</span>
                  <h2>Flux des véhicules</h2>
                </div>
                <Link
                  href={`/vehicles?site=${selectedSiteId}`}
                  className="portal-inline-link"
                >
                  Gérer les véhicules <Icon name="arrow" size={15} />
                </Link>
              </div>
              <div className="portal-flow-list">
                <div>
                  <span className="portal-flow-dot portal-flow-dot--waiting" />
                  <div>
                    <small>À laver</small>
                    <strong>{waiting.length}</strong>
                  </div>
                </div>
                <div>
                  <span className="portal-flow-dot portal-flow-dot--washing" />
                  <div>
                    <small>En lavage</small>
                    <strong>{washing.length}</strong>
                  </div>
                </div>
                <div>
                  <span className="portal-flow-dot portal-flow-dot--done" />
                  <div>
                    <small>Lavés</small>
                    <strong>{done.length}</strong>
                  </div>
                </div>
              </div>
              <div className="portal-alert-list">
                <div>
                  <Icon name="warning" size={17} />
                  <span>Véhicules urgents</span>
                  <strong>
                    {
                      vehicles.filter(
                        (vehicle) =>
                          vehicle.urgent && vehicle.status !== "done",
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <Icon name="users" size={17} />
                  <span>Clients sur place</span>
                  <strong>
                    {
                      vehicles.filter(
                        (vehicle) =>
                          vehicle.customer_waiting && vehicle.status !== "done",
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <Icon name="calendar" size={17} />
                  <span>Journées déclarées</span>
                  <strong>{declaredDays.length}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="calendar-layout">
            <article className="panel work-calendar-panel">
              <div className="work-calendar__header">
                <div>
                  <span className="panel__eyebrow">Calendrier des présences</span>
                  <h2>
                    {calendarMonth.toLocaleDateString("fr-FR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                </div>
                <div className="calendar-navigation">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => void moveMonth(-1)}
                    aria-label="Mois précédent"
                  >
                    <Icon name="chevronLeft" />
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const current = new Date();
                      const currentMonth = new Date(
                        current.getFullYear(),
                        current.getMonth(),
                        1,
                      );
                      setCalendarMonth(currentMonth);
                      setSelectedDate(localDate(current));
                      void loadSite(selectedSiteId, currentMonth);
                    }}
                  >
                    Aujourd’hui
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => void moveMonth(1)}
                    aria-label="Mois suivant"
                  >
                    <Icon name="chevronRight" />
                  </button>
                </div>
              </div>

              <div className="work-calendar">
                {weekDays.map((day) => (
                  <div className="work-calendar__weekday" key={day}>
                    {day}
                  </div>
                ))}
                {cells.map((cell) => {
                  const days = workDays.filter(
                    (day) => day.work_date === cell.key,
                  );
                  const declared = days.filter((day) => day.submitted_at).length;
                  return (
                    <button
                      type="button"
                      key={cell.key}
                      className={`work-calendar__day ${!cell.inMonth ? "work-calendar__day--outside" : ""} ${selectedDate === cell.key ? "work-calendar__day--selected" : ""} ${cell.key === today ? "work-calendar__day--today" : ""}`}
                      onClick={() => setSelectedDate(cell.key)}
                    >
                      <strong>{cell.date.getDate()}</strong>
                      {days.length > 0 && (
                        <span className="calendar-day-count">
                          {days.length} déclaration{days.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {days.length === 1 && (
                        <span className={`attendance-badge attendance-badge--${days[0].day_type}`}>
                          {dayTypeLabel(days[0].day_type)}
                        </span>
                      )}
                      <div className="calendar-day-dots">
                        {declared > 0 && (
                          <i className="calendar-dot calendar-dot--validated" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="panel selected-day-panel">
              <div className="panel__header portal-panel__header">
                <div>
                  <span className="panel__eyebrow">Journée sélectionnée</span>
                  <h2>{dateLongLabel(selectedDate)}</h2>
                </div>
              </div>
              <div className="selected-day-list">
                {selectedDays.length ? (
                  selectedDays.map((day) => {
                    const provider = providers.find(
                      (item) => item.id === day.provider_id,
                    );
                    return (
                      <div className="selected-day-row" key={day.id}>
                        <div className="selected-day-row__identity">
                          <span className="provider-avatar">
                            {providerInitials(
                              provider?.full_name ?? "Prestataire",
                            )}
                          </span>
                          <div>
                            <strong>
                              {provider?.full_name ?? "Prestataire"}
                            </strong>
                            <small>
                              {dayTypeLabel(day.day_type)} · {timeLabel(day.started_at)} →{" "}
                              {timeLabel(day.ended_at)} · {dayDuration(day)}
                            </small>
                            {day.notes && <small>{day.notes}</small>}
                          </div>
                        </div>
                        {day.submitted_at ? (
                          <span className="status-pill status-pill--active">
                            <i /> Déclarée
                          </span>
                        ) : (
                          <span className="status-pill">Non déclarée</span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="portal-list-empty">
                    <Icon name="calendar" size={25} />
                    <strong>Aucune journée déclarée</strong>
                    <span>Aucune présence n’est enregistrée à cette date.</span>
                  </div>
                )}
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
