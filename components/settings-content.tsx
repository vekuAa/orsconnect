"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

export function SettingsContent() {
  const [realtime, setRealtime] = useState(true);
  const [mailAlerts, setMailAlerts] = useState(true);
  const [duplicateProtection, setDuplicateProtection] = useState(true);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <>
      <PageHeader eyebrow="Configuration ORS" title="Paramètres" description="Configurez les règles générales de la plateforme et la sécurité des accès." actions={<button className="primary-button" onClick={save}><Icon name="check" size={17}/>{saved ? "Enregistré" : "Enregistrer"}</button>} />
      <section className="settings-layout">
        <aside className="settings-nav"><button className="active"><Icon name="building" size={18}/>Organisation</button><button><Icon name="wallet" size={18}/>Tarification</button><button><Icon name="bell" size={18}/>Notifications</button><button><Icon name="shield" size={18}/>Sécurité</button></aside>
        <div className="settings-main">
          <article className="panel settings-card"><div className="settings-card__header"><span className="settings-card__icon"><Icon name="building"/></span><div><h2>Informations de l’organisation</h2><p>Identité affichée dans les espaces concession et prestataire.</p></div></div><div className="form-grid settings-form"><label className="field-group"><span>Nom commercial</span><input defaultValue="ORS Solution"/></label><label className="field-group"><span>Domaine de connexion</span><input defaultValue="ors-connect.fr"/></label><label className="field-group"><span>E-mail de support</span><input defaultValue="contact@ors-solution.fr"/></label><label className="field-group"><span>Fuseau horaire</span><select defaultValue="Europe/Paris"><option>Europe/Paris</option></select></label></div></article>
          <article className="panel settings-card"><div className="settings-card__header"><span className="settings-card__icon"><Icon name="car"/></span><div><h2>Règles opérationnelles</h2><p>Comportements appliqués sur les flux de véhicules.</p></div></div><div className="setting-toggles"><label><div><strong>Synchronisation en temps réel</strong><span>Met à jour les écrans concession et prestataire sans rechargement.</span></div><input type="checkbox" checked={realtime} onChange={(e) => setRealtime(e.target.checked)}/><i/></label><label><div><strong>Protection contre les doublons</strong><span>Interdit une même immatriculation deux fois sur une journée et un même site.</span></div><input type="checkbox" checked={duplicateProtection} onChange={(e) => setDuplicateProtection(e.target.checked)}/><i/></label><label><div><strong>Alertes e-mail de production</strong><span>Envoie une alerte lorsqu’un objectif ou un seuil critique est atteint.</span></div><input type="checkbox" checked={mailAlerts} onChange={(e) => setMailAlerts(e.target.checked)}/><i/></label></div></article>
          <article className="panel settings-card security-note"><span><Icon name="shield"/></span><div><h3>Sécurité de la V2</h3><p>Les sessions seront conservées dans des cookies sécurisés côté serveur, les documents resteront privés et les accès seront filtrés par rôle et par concession.</p></div></article>
        </div>
      </section>
    </>
  );
}
