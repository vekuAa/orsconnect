"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppProfile } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { OrsLogo } from "./logo";

interface NavigationItem {
  href: string;
  label: string;
  icon: IconName;
}

const adminNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Vue d’ensemble", icon: "dashboard" },
  { href: "/vehicles", label: "Véhicules", icon: "car" },
  { href: "/prestataires", label: "Prestataires", icon: "users" },
  { href: "/concessions", label: "Concessions", icon: "building" },
  { href: "/finances", label: "Finances", icon: "chart" },
];

const directorNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Vue d’ensemble", icon: "dashboard" },
  { href: "/vehicles", label: "Véhicules", icon: "car" },
  { href: "/concessions", label: "Concessions", icon: "building" },
  { href: "/finances", label: "Finances", icon: "chart" },
];

const concessionNavigation: NavigationItem[] = [
  { href: "/concession", label: "Mon espace", icon: "dashboard" },
  { href: "/vehicles", label: "Véhicules", icon: "car" },
];

const providerNavigation: NavigationItem[] = [
  { href: "/prestataire", label: "Ma journée", icon: "dashboard" },
  { href: "/vehicles", label: "Véhicules", icon: "car" },
  { href: "/prestataire/journees", label: "Mes journées", icon: "calendar" },
  { href: "/prestataire/revenus", label: "Mes revenus", icon: "wallet" },
];

const roleLabels: Record<AppProfile["role"], string> = {
  admin: "Administration ORS",
  directeur: "Direction",
  concession: "Responsable concession",
  prestataire: "Prestataire",
};

function navigationForRole(role: AppProfile["role"]) {
  if (role === "admin") return adminNavigation;
  if (role === "directeur") return directorNavigation;
  if (role === "concession") return concessionNavigation;
  return providerNavigation;
}

export function AppShell({ children, profile }: { children: React.ReactNode; profile: AppProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = navigationForRole(profile.role);
  const showSettings = profile.role === "admin";

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__top">
          <OrsLogo />
          <button type="button" className="icon-button sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Navigation principale">
          <span className="sidebar__section-label">Pilotage</span>
          {navigation.map((item) => {
            const active = item.href === "/prestataire"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={`nav-link ${active ? "nav-link--active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {showSettings && (
            <>
              <span className="sidebar__section-label sidebar__section-label--second">Configuration</span>
              <Link
                href="/settings"
                className={`nav-link ${pathname === "/settings" ? "nav-link--active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name="settings" />
                <span>Paramètres</span>
              </Link>
            </>
          )}
        </nav>

        <div className="sidebar__footer">
          <div className="support-card">
            <div className="support-card__icon"><Icon name="shield" size={18} /></div>
            <strong>Besoin d’aide ?</strong>
            <span>Support ORS disponible</span>
            <button type="button">Contacter le support</button>
          </div>
          <button type="button" className="logout-button" onClick={logout}>
            <Icon name="logout" />
            Se déconnecter
          </button>
        </div>
      </aside>

      {mobileOpen && <button type="button" className="mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />}

      <main className="main-area">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Icon name="menu" />
          </button>
          <div className="topbar__context">
            <span className="status-dot" />
            <span>Système opérationnel</span>
          </div>
          <div className="topbar__actions">
            <button type="button" className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" />
              <span />
            </button>
            <div className="user-menu">
              <div className="avatar">{profile.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
              <div className="user-menu__copy">
                <strong>{profile.fullName}</strong>
                <span>{roleLabels[profile.role]}</span>
              </div>
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
