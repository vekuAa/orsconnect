"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type { BillingMode, BillingType } from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

interface LiveConcession {
  id: string;
  name: string;
  city: string;
  address: string;
  contactEmail: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  dailyTarget: number;
  billingMode: BillingMode;
  billedDayRate: number;
  billedRates: Record<BillingType, number>;
  active: boolean;
  activeProviders: number;
  completedToday: number;
  washingToday: number;
  waitingToday: number;
  pendingDays: number;
}

interface ConcessionFormValues {
  name: string;
  city: string;
  address: string;
  contactEmail: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  managerPassword: string;
  dailyTarget: number;
  billingMode: BillingMode;
  billedDayRate: number;
  billedVoRate: number;
  billedVnRate: number;
  billedRelavageRate: number;
  billedTresSaleRate: number;
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function billingSummary(concession: LiveConcession) {
  if (concession.billingMode === "day") {
    return `${formatCurrency(concession.billedDayRate)} / jour`;
  }
  return `VO ${formatCurrency(concession.billedRates.vo)} · VN ${formatCurrency(concession.billedRates.vn)} · Relavage ${formatCurrency(concession.billedRates.relavage)} · Très sale ${formatCurrency(concession.billedRates.tres_sale)}`;
}

function ConcessionFormModal({
  concession,
  onClose,
  onSaved,
}: {
  concession?: LiveConcession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<ConcessionFormValues>({
    name: concession?.name ?? "",
    city: concession?.city ?? "",
    address: concession?.address ?? "",
    contactEmail: concession?.contactEmail ?? "",
    managerName: concession?.managerName ?? "",
    managerEmail: concession?.managerEmail ?? "",
    managerPhone: concession?.managerPhone ?? "",
    managerPassword: "",
    dailyTarget: concession?.dailyTarget ?? 24,
    billingMode: concession?.billingMode ?? "day",
    billedDayRate: concession?.billedDayRate ?? 190,
    billedVoRate: concession?.billedRates.vo ?? 30,
    billedVnRate: concession?.billedRates.vn ?? 25,
    billedRelavageRate: concession?.billedRates.relavage ?? 20,
    billedTresSaleRate: concession?.billedRates.tres_sale ?? 45,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const patch = <K extends keyof ConcessionFormValues>(
    key: K,
    value: ConcessionFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/concessions", {
        method: concession ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(concession ? { concessionId: concession.id } : {}),
          name: values.name,
          city: values.city,
          address: values.address,
          contactEmail: values.contactEmail,
          managerName: values.managerName,
          managerEmail: values.managerEmail,
          managerPhone: values.managerPhone,
          ...(values.managerPassword
            ? { managerPassword: values.managerPassword }
            : {}),
          dailyTarget: values.dailyTarget,
          billingMode: values.billingMode,
          billedDayRate: values.billedDayRate,
          billedVoRate: values.billedVoRate,
          billedVnRate: values.billedVnRate,
          billedRelavageRate: values.billedRelavageRate,
          billedTresSaleRate: values.billedTresSaleRate,
          ...(concession ? { active: concession.active } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(
          result.error ??
            `${concession ? "Modification" : "Création"} impossible (HTTP ${response.status}).`,
        );
        return;
      }
      onSaved();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Le serveur ne répond pas.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concession-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">
              {concession ? "Gestion du site" : "Nouveau site client"}
            </span>
            <h2 id="concession-form-title">
              {concession ? "Modifier la concession" : "Ajouter une concession"}
            </h2>
            <p>
              Coordonnées, responsable, objectif et facturation sont modifiables.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon name="close" />
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <section className="form-section">
            <div className="form-section__title">
              <strong>Informations du site</strong>
              <span>Coordonnées et objectif quotidien</span>
            </div>
            <div className="form-grid">
              <label className="field-group">
                <span>Nom de la concession *</span>
                <input
                  value={values.name}
                  onChange={(event) => patch("name", event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="field-group">
                <span>Ville *</span>
                <input
                  value={values.city}
                  onChange={(event) => patch("city", event.target.value)}
                  required
                />
              </label>
              <label className="field-group field-group--wide">
                <span>Adresse *</span>
                <input
                  value={values.address}
                  onChange={(event) => patch("address", event.target.value)}
                  required
                />
              </label>
              <label className="field-group">
                <span>E-mail général</span>
                <input
                  type="email"
                  value={values.contactEmail}
                  onChange={(event) =>
                    patch("contactEmail", event.target.value)
                  }
                />
              </label>
              <label className="field-group">
                <span>Objectif véhicules / jour</span>
                <input
                  type="number"
                  min="1"
                  value={values.dailyTarget}
                  onChange={(event) =>
                    patch(
                      "dailyTarget",
                      Math.max(1, Number(event.target.value)),
                    )
                  }
                  required
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section__title">
              <strong>Compte responsable concession</strong>
              <span>Ce compte accède uniquement au portail de son site.</span>
            </div>
            <div className="form-grid">
              <label className="field-group">
                <span>Nom du responsable *</span>
                <input
                  value={values.managerName}
                  onChange={(event) =>
                    patch("managerName", event.target.value)
                  }
                  required
                />
              </label>
              <label className="field-group">
                <span>Téléphone</span>
                <input
                  value={values.managerPhone}
                  onChange={(event) =>
                    patch("managerPhone", event.target.value)
                  }
                />
              </label>
              <label className="field-group">
                <span>E-mail de connexion *</span>
                <input
                  type="email"
                  value={values.managerEmail}
                  onChange={(event) =>
                    patch("managerEmail", event.target.value)
                  }
                  required
                />
              </label>
              <label className="field-group">
                <span>
                  {concession
                    ? "Nouveau mot de passe (facultatif)"
                    : "Mot de passe temporaire *"}
                </span>
                <input
                  type="password"
                  minLength={8}
                  value={values.managerPassword}
                  onChange={(event) =>
                    patch("managerPassword", event.target.value)
                  }
                  required={!concession}
                  autoComplete="new-password"
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section__title">
              <strong>Facturation ORS → concession</strong>
              <span>Indépendante de la rémunération du prestataire.</span>
            </div>
            <div className="toggle-grid">
              <label className="check-option">
                <input
                  type="radio"
                  name="billing-mode"
                  checked={values.billingMode === "day"}
                  onChange={() => patch("billingMode", "day")}
                />
                <span>
                  <Icon name="calendar" size={18} />
                  <b>Forfait journalier</b>
                  <small>Une seule facturation par site et par jour.</small>
                </span>
              </label>
              <label className="check-option">
                <input
                  type="radio"
                  name="billing-mode"
                  checked={values.billingMode === "vehicle"}
                  onChange={() => patch("billingMode", "vehicle")}
                />
                <span>
                  <Icon name="car" size={18} />
                  <b>Facturation à la voiture</b>
                  <small>Chaque véhicule terminé génère sa facturation.</small>
                </span>
              </label>
            </div>

            {values.billingMode === "day" ? (
              <div className="form-grid form-grid--spaced">
                <label className="field-group">
                  <span>Forfait facturé par jour *</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.billedDayRate}
                    onChange={(event) =>
                      patch(
                        "billedDayRate",
                        Math.max(0, Number(event.target.value)),
                      )
                    }
                    required
                  />
                </label>
              </div>
            ) : (
              <div className="rate-editor__grid form-grid--spaced">
                {(
                  [
                    ["billedVoRate", "VO"],
                    ["billedVnRate", "VN"],
                    ["billedRelavageRate", "Relavage"],
                    ["billedTresSaleRate", "Très sale"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={values[key]}
                        onChange={(event) =>
                          patch(key, Math.max(0, Number(event.target.value)))
                        }
                        required
                      />
                      <b>€</b>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {error && <div className="form-error">{error}</div>}

          <div className="modal__footer">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading
                ? "Enregistrement…"
                : concession
                  ? "Enregistrer"
                  : "Créer la concession"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function ConcessionsContent() {
  const supabase = useMemo(() => createClient(), []);
  const [concessions, setConcessions] = useState<LiveConcession[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showCreate, setShowCreate] = useState(false);
  const [editingConcession, setEditingConcession] =
    useState<LiveConcession | null>(null);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data: selfRow, error: selfError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", authData.user.id)
      .single();

    if (selfError || !selfRow || selfRow.role !== "admin") {
      setError(selfError?.message ?? "Accès administrateur requis.");
      setLoading(false);
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [
      concessionResult,
      accessResult,
      profileResult,
      vehicleResult,
      workDayResult,
    ] = await Promise.all([
      supabase
        .from("concessions")
        .select(
          "id, name, address, city, contact_email, manager_name, manager_email, daily_target, billing_mode, billed_day_rate, billed_vo_rate, billed_vn_rate, billed_relavage_rate, billed_tres_sale_rate, active",
        )
        .eq("organization_id", selfRow.organization_id)
        .is("archived_at", null)
        .order("name"),
      supabase.from("concession_access").select("profile_id, concession_id"),
      supabase
        .from("profiles")
        .select("id, role, status, phone")
        .eq("organization_id", selfRow.organization_id)
        .is("archived_at", null),
      supabase
        .from("vehicles")
        .select("concession_id, status")
        .gte("created_at", startOfDay.toISOString())
        .neq("status", "cancelled"),
      supabase
        .from("work_days")
        .select("concession_id, ended_at, validated_by")
        .eq("work_date", today),
    ]);

    const firstError =
      concessionResult.error ??
      accessResult.error ??
      profileResult.error ??
      vehicleResult.error ??
      workDayResult.error;
    if (firstError) setError(firstError.message);

    const accessRows = accessResult.data ?? [];
    const profileRows = profileResult.data ?? [];
    const vehicleRows = vehicleResult.data ?? [];
    const dayRows = workDayResult.data ?? [];
    const providerIds = new Set(
      profileRows
        .filter(
          (profile) =>
            profile.role === "prestataire" && profile.status === "active",
        )
        .map((profile) => profile.id),
    );

    const mapped: LiveConcession[] = (concessionResult.data ?? []).map(
      (concession) => {
        const siteVehicles = vehicleRows.filter(
          (vehicle) => vehicle.concession_id === concession.id,
        );
        const managerAccess = accessRows.find((access) => {
          const profile = profileRows.find(
            (item) => item.id === access.profile_id,
          );
          return (
            access.concession_id === concession.id &&
            profile?.role === "concession"
          );
        });
        const managerProfile = profileRows.find(
          (profile) => profile.id === managerAccess?.profile_id,
        );

        return {
          id: concession.id,
          name: concession.name,
          city: concession.city,
          address: concession.address,
          contactEmail: concession.contact_email ?? "",
          managerName: concession.manager_name ?? "",
          managerEmail: concession.manager_email ?? "",
          managerPhone: managerProfile?.phone ?? "",
          dailyTarget: concession.daily_target,
          billingMode: concession.billing_mode as BillingMode,
          billedDayRate: asNumber(concession.billed_day_rate),
          billedRates: {
            vo: asNumber(concession.billed_vo_rate),
            vn: asNumber(concession.billed_vn_rate),
            relavage: asNumber(concession.billed_relavage_rate),
            tres_sale: asNumber(concession.billed_tres_sale_rate),
          },
          active: concession.active,
          activeProviders: accessRows.filter(
            (access) =>
              access.concession_id === concession.id &&
              providerIds.has(access.profile_id),
          ).length,
          completedToday: siteVehicles.filter(
            (vehicle) => vehicle.status === "done",
          ).length,
          washingToday: siteVehicles.filter(
            (vehicle) => vehicle.status === "washing",
          ).length,
          waitingToday: siteVehicles.filter(
            (vehicle) => vehicle.status === "waiting",
          ).length,
          pendingDays: dayRows.filter(
            (day) =>
              day.concession_id === concession.id &&
              day.ended_at &&
              !day.validated_by,
          ).length,
        };
      },
    );

    setConcessions(mapped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("admin-concessions-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "concessions" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_days" },
        () => void loadData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const filtered = useMemo(
    () =>
      concessions.filter((concession) =>
        `${concession.name} ${concession.city} ${concession.address}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [concessions, query],
  );

  const archiveConcession = async (concession: LiveConcession) => {
    const accepted = window.confirm(
      `Supprimer ${concession.name} ? Le site et son compte responsable seront archivés, mais l’historique financier restera conservé.`,
    );
    if (!accepted) return;

    setBusyId(concession.id);
    setError("");
    const response = await fetch("/api/admin/concessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concessionId: concession.id }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) setError(result.error ?? "Suppression impossible.");
    await loadData();
    setBusyId("");
  };

  if (loading) {
    return (
      <section className="panel loading-panel">
        <strong>Chargement des concessions…</strong>
        <span>Calcul de la production et des affectations</span>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Portefeuille clients"
        title="Concessions"
        description="Créez, modifiez ou archivez les sites et leurs comptes responsables."
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowCreate(true)}
          >
            <Icon name="plus" size={18} /> Ajouter une concession
          </button>
        }
      />

      {error && (
        <div className="page-alert page-alert--error">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      <section className="toolbar toolbar--transparent">
        <div className="search-input">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une concession ou une ville…"
          />
        </div>
        <div className="view-switch">
          <button
            type="button"
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
            aria-label="Vue grille"
          >
            <Icon name="dashboard" size={17} />
          </button>
          <button
            type="button"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
            aria-label="Vue liste"
          >
            <Icon name="menu" size={17} />
          </button>
        </div>
      </section>

      <section
        className={`concessions-grid ${view === "list" ? "concessions-grid--list" : ""}`}
      >
        {filtered.map((concession, index) => {
          const performance = Math.min(
            100,
            Math.round(
              (concession.completedToday / Math.max(1, concession.dailyTarget)) *
                100,
            ),
          );
          return (
            <article className="concession-card" key={concession.id}>
              <div className="concession-card__top">
                <div className="concession-logo">
                  <Icon name="building" />
                </div>
                <span
                  className={`status-pill status-pill--${concession.active ? "active" : "inactive"}`}
                >
                  <i /> {concession.active ? "Actif" : "Inactif"}
                </span>
                <div className="concession-card__actions">
                  <button
                    type="button"
                    className="icon-button icon-button--small"
                    onClick={() => setEditingConcession(concession)}
                    title="Modifier"
                    aria-label={`Modifier ${concession.name}`}
                  >
                    <Icon name="edit" size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--small icon-button--danger"
                    onClick={() => void archiveConcession(concession)}
                    disabled={busyId === concession.id}
                    title="Supprimer"
                    aria-label={`Supprimer ${concession.name}`}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </div>

              <div className="concession-card__identity">
                <span>SITE {String(index + 1).padStart(2, "0")}</span>
                <h2>{concession.name}</h2>
                <p>{concession.address}</p>
              </div>

              <div className="concession-card__stats">
                <div>
                  <span>Production</span>
                  <strong>
                    {concession.completedToday}{" "}
                    <small>/ {concession.dailyTarget}</small>
                  </strong>
                </div>
                <div>
                  <span>Prestataires</span>
                  <strong>{concession.activeProviders}</strong>
                </div>
                <div>
                  <span>À valider</span>
                  <strong>{concession.pendingDays}</strong>
                </div>
              </div>

              <div className="concession-card__progress">
                <div>
                  <span>Objectif du jour</span>
                  <strong>{performance}%</strong>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${performance}%` }} />
                </div>
              </div>

              <div className="concession-billing-summary">
                <small>
                  {concession.billingMode === "day"
                    ? "Forfait journalier"
                    : "Facturation à la voiture"}
                </small>
                <strong>{billingSummary(concession)}</strong>
              </div>

              <div className="concession-card__manager">
                <span>
                  {(concession.managerName || "RC")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <small>Responsable concession</small>
                  <strong>
                    {concession.managerName || "Non renseigné"}
                  </strong>
                </div>
                {concession.managerEmail && (
                  <a
                    className="icon-button icon-button--small"
                    href={`mailto:${concession.managerEmail}`}
                    aria-label={`Écrire à ${concession.managerName}`}
                  >
                    <Icon name="mail" size={17} />
                  </a>
                )}
              </div>

              <Link
                className="card-link-button"
                href={`/vehicles?site=${concession.id}`}
              >
                Ouvrir la concession <Icon name="arrow" size={16} />
              </Link>
            </article>
          );
        })}

        <button
          type="button"
          className="add-concession-card"
          onClick={() => setShowCreate(true)}
        >
          <span>
            <Icon name="plus" />
          </span>
          <strong>Ajouter une concession</strong>
          <p>Créez un nouvel espace client et son compte responsable.</p>
        </button>
      </section>

      {showCreate && (
        <ConcessionFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            void loadData();
          }}
        />
      )}

      {editingConcession && (
        <ConcessionFormModal
          concession={editingConcession}
          onClose={() => setEditingConcession(null)}
          onSaved={() => {
            setEditingConcession(null);
            void loadData();
          }}
        />
      )}
    </>
  );
}
