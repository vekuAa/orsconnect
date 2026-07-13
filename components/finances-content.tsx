"use client";

import { useMemo, useState } from "react";
import { initialVehicles, providers } from "@/lib/demo-data";
import { calculateDailyFinance, formatCurrency } from "@/lib/finance";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

const monthly = [
  { month: "Février 2026", billed: 12640, providers: 7820, fees: 210, margin: 4610 },
  { month: "Mars 2026", billed: 15120, providers: 9140, fees: 265, margin: 5715 },
  { month: "Avril 2026", billed: 16780, providers: 10110, fees: 290, margin: 6380 },
  { month: "Mai 2026", billed: 18240, providers: 10880, fees: 320, margin: 7040 },
  { month: "Juin 2026", billed: 19490, providers: 11620, fees: 350, margin: 7520 },
  { month: "Juillet 2026", billed: 10280, providers: 6010, fees: 185, margin: 4085 },
];

export function FinancesContent() {
  const [period, setPeriod] = useState("Juillet 2026");
  const [dailyRate, setDailyRate] = useState(190);
  const [providerDay, setProviderDay] = useState(110);
  const [days, setDays] = useState(21);
  const finance = useMemo(() => calculateDailyFinance(initialVehicles, providers), []);
  const monthlyBilled = dailyRate * days;
  const monthlyCost = providerDay * days;
  const monthlyMargin = monthlyBilled - monthlyCost;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage économique"
        title="Finances"
        description="Distinguez clairement la facturation client, la rémunération prestataire et la marge ORS."
        actions={<button className="secondary-button"><Icon name="download" size={17}/> Exporter le rapport</button>}
      />

      <section className="finance-filter-bar">
        <div><label>Période</label><select value={period} onChange={(e) => setPeriod(e.target.value)}>{monthly.map((row) => <option key={row.month}>{row.month}</option>)}</select></div>
        <div><label>Concession</label><select><option>Toutes les concessions</option><option>Peugeot Car Avenue · Yutz</option><option>Peugeot Autobernard · Grenoble</option></select></div>
        <span className="last-update"><i/> Données actualisées à 14:32</span>
      </section>

      <section className="stats-grid stats-grid--finance">
        <article className="finance-kpi"><span className="finance-kpi__icon finance-kpi__icon--blue"><Icon name="wallet"/></span><div><span>CA facturé</span><strong>10 280 €</strong><small>+11,8% vs période précédente</small></div></article>
        <article className="finance-kpi"><span className="finance-kpi__icon finance-kpi__icon--violet"><Icon name="users"/></span><div><span>Coût prestataires</span><strong>6 010 €</strong><small>58,5% du chiffre d’affaires</small></div></article>
        <article className="finance-kpi"><span className="finance-kpi__icon finance-kpi__icon--amber"><Icon name="chart"/></span><div><span>Frais opérationnels</span><strong>185 €</strong><small>Affacturage et ajustements</small></div></article>
        <article className="finance-kpi finance-kpi--highlight"><span className="finance-kpi__icon finance-kpi__icon--green"><Icon name="trend"/></span><div><span>Marge brute ORS</span><strong>4 085 €</strong><small>39,7% de taux de marge</small></div></article>
      </section>

      <section className="finance-layout">
        <article className="panel finance-history">
          <div className="panel__header"><div><span className="panel__eyebrow">Historique</span><h2>Résultats mensuels</h2></div><span className="info-chip"><Icon name="calendar" size={15}/> 6 derniers mois</span></div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Mois</th><th>Facturé</th><th>Prestataires</th><th>Frais</th><th>Marge ORS</th><th>Taux</th></tr></thead>
              <tbody>{monthly.map((row) => <tr key={row.month} className={period === row.month ? "selected-row" : ""}><td><strong>{row.month}</strong></td><td>{formatCurrency(row.billed)}</td><td>{formatCurrency(row.providers)}</td><td>{formatCurrency(row.fees)}</td><td><strong className="margin-value">{formatCurrency(row.margin)}</strong></td><td><span className="rate-pill">{((row.margin / row.billed) * 100).toFixed(1)}%</span></td></tr>)}</tbody>
            </table>
          </div>
        </article>

        <article className="panel simulator-panel">
          <div className="panel__header"><div><span className="panel__eyebrow">Simulation rapide</span><h2>Rentabilité d’une mission</h2></div><span className="simulator-icon"><Icon name="target"/></span></div>
          <p className="panel-description">Testez un forfait journalier avant de contractualiser une nouvelle concession.</p>
          <div className="simulator-fields">
            <label><span>Facturation concession / jour</span><div><input type="number" value={dailyRate} onChange={(e) => setDailyRate(Number(e.target.value))}/><b>€</b></div></label>
            <label><span>Rémunération prestataire / jour</span><div><input type="number" value={providerDay} onChange={(e) => setProviderDay(Number(e.target.value))}/><b>€</b></div></label>
            <label><span>Nombre de jours facturés</span><div><input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))}/><b>jours</b></div></label>
          </div>
          <div className="simulator-result">
            <div><span>CA mensuel</span><strong>{formatCurrency(monthlyBilled)}</strong></div>
            <div><span>Coût prestataire</span><strong>- {formatCurrency(monthlyCost)}</strong></div>
            <hr/>
            <div className="simulator-result__margin"><span>Marge brute ORS</span><strong>{formatCurrency(monthlyMargin)}</strong></div>
            <small>{monthlyBilled > 0 ? ((monthlyMargin / monthlyBilled) * 100).toFixed(1) : "0"}% de taux de marge</small>
          </div>
        </article>
      </section>

      <section className="panel daily-finance-banner">
        <div><span className="daily-finance-banner__icon"><Icon name="shield"/></span><div><span>Contrôle du jour · Démonstration Yutz</span><strong>Les opérations terminées génèrent {formatCurrency(finance.billed)} de facturation et {formatCurrency(finance.grossMargin)} de marge brute.</strong></div></div>
        <button className="text-link">Voir le détail comptable <Icon name="arrow" size={15}/></button>
      </section>
    </>
  );
}
