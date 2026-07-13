import { LoginForm } from "@/components/login-form";
import { OrsLogo } from "@/components/logo";
import { Icon } from "@/components/icons";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-showcase__glow" />
        <div className="login-showcase__inner">
          <OrsLogo />
          <div className="login-showcase__content">
            <span className="showcase-pill"><span /> Plateforme métier ORS</span>
            <h1>Pilotez chaque prestation.<br /><em>Mesurez chaque résultat.</em></h1>
            <p>Une vue unique pour coordonner les concessions, les prestataires et la rentabilité de vos opérations automobiles.</p>
            <div className="showcase-metrics">
              <div><strong>24</strong><span>véhicules / jour</span></div>
              <div><strong>3</strong><span>flux synchronisés</span></div>
              <div><strong>100%</strong><span>traçable</span></div>
            </div>
          </div>
          <div className="showcase-preview">
            <div className="showcase-preview__header">
              <span><i /> Activité en direct</span>
              <span>Aujourd’hui</span>
            </div>
            <div className="showcase-preview__grid">
              <div className="mini-kpi"><Icon name="car"/><span>Terminés</span><strong>18</strong><small>+12% vs hier</small></div>
              <div className="mini-kpi"><Icon name="trend"/><span>Marge ORS</span><strong>38%</strong><small>Objectif atteint</small></div>
            </div>
            <div className="showcase-bars">
              {[72, 48, 86, 61, 92, 78, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
          </div>
          <span className="login-showcase__footer">Optimiser · Rentabiliser · Satisfaction</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__mobile-brand"><OrsLogo /></div>
        <div className="login-panel__card">
          <span className="eyebrow">Espace sécurisé</span>
          <h2>Bienvenue sur ORS Connect</h2>
          <p>Connectez-vous pour accéder à votre tableau de bord.</p>
          <Suspense fallback={<div className="demo-notice">Chargement de la connexion…</div>}><LoginForm /></Suspense>
        </div>
        <p className="login-panel__legal">© 2026 ORS Solution · Accès strictement professionnel</p>
      </section>
    </main>
  );
}
