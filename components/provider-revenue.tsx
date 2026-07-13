"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import { Icon } from "./icons";
import styles from "./provider-portal.module.css";

interface Site {
  id: string;
  name: string;
  city: string;
}

interface Row {
  entry_date: string;
  provider_amount: number | string;
  source: "vehicle" | "day" | "concession_day" | "adjustment";
  description: string | null;
}

const num = (value: number | string) => Number(value) || 0;

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function sourceLabel(source: Row["source"]) {
  switch (source) {
    case "vehicle":
      return "Véhicule";
    case "day":
      return "Forfait journalier";
    case "concession_day":
      return "Forfait concession";
    case "adjustment":
      return "Ajustement";
    default:
      return "Autre";
  }
}

export function ProviderRevenue() {
  const supabase = useMemo(() => createClient(), []);

  const [uid, setUid] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (concessionId: string, providerId: string, selectedMonth: Date) => {
      setError("");

      const start = `${monthKey(selectedMonth)}-01`;
      const nextMonth = new Date(
        selectedMonth.getFullYear(),
        selectedMonth.getMonth() + 1,
        1,
      );
      const end = `${monthKey(nextMonth)}-01`;

      const { data, error: queryError } = await supabase
        .from("financial_entries")
        .select("entry_date,provider_amount,source,description")
        .eq("provider_id", providerId)
        .eq("concession_id", concessionId)
        .gte("entry_date", start)
        .lt("entry_date", end)
        .order("entry_date");

      if (queryError) {
        setError(queryError.message);
        setRows([]);
        return;
      }

      setRows((data ?? []) as Row[]);
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setError(userError?.message ?? "Utilisateur non connecté.");
        setLoading(false);
        return;
      }

      const { data: accessRows, error: accessError } = await supabase
        .from("concession_access")
        .select("concession_id")
        .eq("profile_id", user.id);

      if (cancelled) return;

      if (accessError) {
        setError(accessError.message);
        setLoading(false);
        return;
      }

      const concessionIds = (accessRows ?? []).map(
        (row) => row.concession_id as string,
      );

      let siteList: Site[] = [];

      if (concessionIds.length > 0) {
        const { data: siteRows, error: siteError } = await supabase
          .from("concessions")
          .select("id,name,city")
          .in("id", concessionIds)
          .eq("active", true)
          .is("archived_at", null);

        if (cancelled) return;

        if (siteError) {
          setError(siteError.message);
          setLoading(false);
          return;
        }

        siteList = (siteRows ?? []) as Site[];
      }

      const firstSiteId = siteList[0]?.id ?? "";

      setUid(user.id);
      setSites(siteList);
      setSiteId(firstSiteId);

      if (firstSiteId) {
        await load(firstSiteId, user.id, month);
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [load, month, supabase]);

  const daily = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of rows) {
      totals.set(
        row.entry_date,
        (totals.get(row.entry_date) ?? 0) + num(row.provider_amount),
      );
    }

    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + num(row.provider_amount), 0),
    [rows],
  );

  const today = new Date().toISOString().slice(0, 10);
  const todayAmount = daily.find(([date]) => date === today)?.[1] ?? 0;
  const average = daily.length > 0 ? total / daily.length : 0;
  const maximum = Math.max(1, ...daily.map(([, value]) => value));

  async function moveMonth(offset: number) {
    const next = new Date(
      month.getFullYear(),
      month.getMonth() + offset,
      1,
    );

    setMonth(next);

    if (!siteId || !uid) return;

    setLoading(true);
    await load(siteId, uid, next);
    setLoading(false);
  }

  async function changeSite(nextSiteId: string) {
    setSiteId(nextSiteId);

    if (!uid) return;

    setLoading(true);
    await load(nextSiteId, uid, month);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>Chargement des revenus…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.calendarToolbar}>
        <div>
          <span className={styles.eyebrow}>Suivi personnel</span>
          <h1 className={styles.heroTitle}>Mes revenus</h1>
          <p className={styles.muted}>
            Consulte ton chiffre d’affaires jour par jour et le total du mois.
          </p>
        </div>

        {sites.length > 1 && (
          <select
            className={styles.siteSelect}
            value={siteId}
            onChange={(event) => void changeSite(event.target.value)}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} · {site.city}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className={styles.alert}>{error}</div>}

      <section className={styles.revenueCards}>
        <article className={styles.revenueCard}>
          <small>Aujourd’hui</small>
          <strong>{formatCurrency(todayAmount)}</strong>
        </article>

        <article className={styles.revenueCard}>
          <small>Ce mois</small>
          <strong>{formatCurrency(total)}</strong>
        </article>

        <article className={styles.revenueCard}>
          <small>Moyenne par jour rémunéré</small>
          <strong>{formatCurrency(average)}</strong>
        </article>
      </section>

      <article className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>
            {month.toLocaleDateString("fr-FR", {
              month: "long",
              year: "numeric",
            })}
          </h2>

          <div className={styles.calendarNav}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void moveMonth(-1)}
              aria-label="Mois précédent"
            >
              <Icon name="chevronLeft" />
            </button>

            <button
              type="button"
              className={styles.secondary}
              onClick={() => void moveMonth(1)}
              aria-label="Mois suivant"
            >
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>

        <div className={styles.chart}>
          {daily.length > 0 ? (
            daily.map(([date, value]) => (
              <div
                className={styles.barWrap}
                key={date}
                title={`${date} : ${formatCurrency(value)}`}
              >
                <div
                  className={styles.bar}
                  style={{
                    height: `${Math.max(3, (value / maximum) * 175)}px`,
                  }}
                />
                <small>{new Date(`${date}T12:00:00`).getDate()}</small>
              </div>
            ))
          ) : (
            <div className={styles.empty}>
              Aucun revenu enregistré pour ce mois.
            </div>
          )}
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Détail journalier</h2>
          <strong>{formatCurrency(total)}</strong>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Origine</th>
                <th>Description</th>
                <th>Montant</th>
              </tr>
            </thead>

            <tbody>
              {rows.length > 0 ? (
                [...rows].reverse().map((row, index) => (
                  <tr key={`${row.entry_date}-${row.source}-${index}`}>
                    <td>
                      {new Date(
                        `${row.entry_date}T12:00:00`,
                      ).toLocaleDateString("fr-FR")}
                    </td>

                    <td>{sourceLabel(row.source)}</td>

                    <td>{row.description || "—"}</td>

                    <td>
                      <strong>
                        {formatCurrency(num(row.provider_amount))}
                      </strong>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Aucune écriture.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}