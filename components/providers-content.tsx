"use client";

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
import type { BillingType, PaymentMode } from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

type ProviderStatus = "active" | "pending" | "inactive";

interface ConcessionRow {
  id: string;
  name: string;
  city: string;
  active: boolean;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: ProviderStatus;
}

interface AccessRow {
  profile_id: string;
  concession_id: string;
}

interface ContractRow {
  provider_id: string;
  concession_id: string;
  payment_mode: PaymentMode;
  day_rate: number | string;
  vo_rate: number | string;
  vn_rate: number | string;
  relavage_rate: number | string;
  tres_sale_rate: number | string;
  daily_deduction: number | string;
  starts_on: string;
  active: boolean;
}

interface VehicleRow {
  provider_id: string | null;
  status: string;
}

interface FinanceRow {
  provider_id: string | null;
  provider_amount: number | string;
}

interface LiveProvider {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  concessionId: string;
  concessionName: string;
  paymentMode: PaymentMode;
  rates: {
    day: number;
    vo: number;
    vn: number;
    relavage: number;
    tres_sale: number;
    dailyDeduction: number;
  };
  status: ProviderStatus;
  vehiclesToday: number;
  monthlyPay: number;
}

const statusLabel: Record<ProviderStatus, string> = {
  active: "Actif",
  pending: "À valider",
  inactive: "Inactif",
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function parisDate() {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStart() {
  return `${parisDate().slice(0, 7)}-01`;
}

function CreateProviderModal({
  concessions,
  onClose,
  onCreated,
}: {
  concessions: ConcessionRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [concessionId, setConcessionId] = useState(concessions[0]?.id ?? "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("day");
  const [dayRate, setDayRate] = useState(110);
  const [voRate, setVoRate] = useState(20);
  const [vnRate, setVnRate] = useState(20);
  const [relavageRate, setRelavageRate] = useState(15);
  const [tresSaleRate, setTresSaleRate] = useState(30);
  const [dailyDeduction, setDailyDeduction] = useState(0);
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
          concessionId,
          paymentMode,
          rates: {
            day: dayRate,
            vo: voRate,
            vn: vnRate,
            relavage: relavageRate,
            tres_sale: tresSaleRate,
          },
          dailyDeduction,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? `Création impossible (HTTP ${response.status}).`);
        return;
      }

      onCreated();
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
        aria-labelledby="create-provider-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">Nouveau compte opérationnel</span>
            <h2 id="create-provider-title">Ajouter un prestataire</h2>
            <p>
              Créez ses identifiants, son affectation et son mode de rémunération.
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
              <strong>Identité et connexion</strong>
              <span>Le prestataire utilisera cet e-mail pour se connecter.</span>
            </div>
            <div className="form-grid">
              <label className="field-group">
                <span>Nom complet *</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  autoFocus
                  placeholder="Prénom Nom"
                />
              </label>
              <label className="field-group">
                <span>Téléphone</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="06 00 00 00 00"
                />
              </label>
              <label className="field-group">
                <span>E-mail de connexion *</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="field-group">
                <span>Mot de passe temporaire *</span>
                <input
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                />
                <small>8 caractères minimum.</small>
              </label>
              <label className="field-group">
                <span>Concession affectée *</span>
                <select
                  value={concessionId}
                  onChange={(event) => setConcessionId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choisir une concession
                  </option>
                  {concessions.map((concession) => (
                    <option key={concession.id} value={concession.id}>
                      {concession.name} · {concession.city}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section__title">
              <strong>Rémunération ORS → prestataire</strong>
              <span>
                Ce choix est indépendant du mode de facturation de la concession.
              </span>
            </div>

            <div className="toggle-grid">
              <label className="check-option">
                <input
                  type="radio"
                  name="provider-payment-mode"
                  checked={paymentMode === "day"}
                  onChange={() => setPaymentMode("day")}
                />
                <span>
                  <Icon name="calendar" size={18} />
                  <b>Forfait journalier</b>
                  <small>Un montant fixe pour chaque journée travaillée.</small>
                </span>
              </label>

              <label className="check-option">
                <input
                  type="radio"
                  name="provider-payment-mode"
                  checked={paymentMode === "vehicle"}
                  onChange={() => setPaymentMode("vehicle")}
                />
                <span>
                  <Icon name="car" size={18} />
                  <b>Paiement à la voiture</b>
                  <small>Le montant dépend du type de véhicule terminé.</small>
                </span>
              </label>
            </div>

            {paymentMode === "day" ? (
              <div className="form-grid" style={{ marginTop: 16 }}>
                <label className="field-group">
                  <span>Forfait prestataire par jour *</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dayRate}
                    onChange={(event) =>
                      setDayRate(Math.max(0, Number(event.target.value) || 0))
                    }
                    required
                  />
                </label>
                <label className="field-group">
                  <span>Retenue journalière éventuelle</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dailyDeduction}
                    onChange={(event) =>
                      setDailyDeduction(
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                  <small>La rémunération nette sera forfait − retenue.</small>
                </label>
              </div>
            ) : (
              <div className="rate-editor__grid" style={{ marginTop: 16 }}>
                {(
                  [
                    ["vo", "VO", voRate, setVoRate],
                    ["vn", "VN", vnRate, setVnRate],
                    ["relavage", "Relavage", relavageRate, setRelavageRate],
                    ["tres_sale", "Très sale", tresSaleRate, setTresSaleRate],
                  ] as const
                ).map(([type, label, value, setter]) => (
                  <label key={type}>
                    <span>{label}</span>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={value}
                        onChange={(event) =>
                          setter(Math.max(0, Number(event.target.value) || 0))
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
            <button type="button" className="secondary-button" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading || !concessionId}
            >
              {loading ? "Création…" : "Créer le prestataire"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function ProvidersContent() {
  const supabase = useMemo(() => createClient(), []);
  const [providers, setProviders] = useState<LiveProvider[]>([]);
  const [concessions, setConcessions] = useState<ConcessionRow[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | PaymentMode>("all");
  const [selected, setSelected] = useState<LiveProvider | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setError("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      setError("Session expirée. Reconnecte-toi.");
      return;
    }

    const { data: selfRow, error: selfError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (selfError || !selfRow || selfRow.role !== "admin") {
      setError(selfError?.message ?? "Accès administrateur requis.");
      return;
    }

    const [concessionResult, profileResult] = await Promise.all([
      supabase
        .from("concessions")
        .select("id, name, city, active")
        .eq("organization_id", selfRow.organization_id)
        .order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, status")
        .eq("organization_id", selfRow.organization_id)
        .eq("role", "prestataire")
        .order("full_name"),
    ]);

    const firstError = concessionResult.error ?? profileResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const concessionRows = (concessionResult.data as ConcessionRow[] | null) ?? [];
    const profileRows = (profileResult.data as ProfileRow[] | null) ?? [];
    setConcessions(concessionRows.filter((concession) => concession.active));

    if (!profileRows.length) {
      setProviders([]);
      setSelected(null);
      return;
    }

    const providerIds = profileRows.map((provider) => provider.id);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [accessResult, contractResult, vehicleResult, financeResult] =
      await Promise.all([
        supabase
          .from("concession_access")
          .select("profile_id, concession_id")
          .in("profile_id", providerIds),
        supabase
          .from("provider_contracts")
          .select(
            "provider_id, concession_id, payment_mode, day_rate, vo_rate, vn_rate, relavage_rate, tres_sale_rate, daily_deduction, starts_on, active",
          )
          .in("provider_id", providerIds)
          .order("starts_on", { ascending: false }),
        supabase
          .from("vehicles")
          .select("provider_id, status")
          .in("provider_id", providerIds)
          .gte("created_at", start.toISOString())
          .neq("status", "cancelled"),
        supabase
          .from("financial_entries")
          .select("provider_id, provider_amount")
          .in("provider_id", providerIds)
          .gte("entry_date", monthStart()),
      ]);

    const operationalError =
      accessResult.error ??
      contractResult.error ??
      vehicleResult.error ??
      financeResult.error;

    if (operationalError) {
      setError(operationalError.message);
      return;
    }

    const accessRows = (accessResult.data as AccessRow[] | null) ?? [];
    const contractRows = (contractResult.data as ContractRow[] | null) ?? [];
    const vehicleRows = (vehicleResult.data as VehicleRow[] | null) ?? [];
    const financeRows = (financeResult.data as FinanceRow[] | null) ?? [];
    const concessionMap = new Map(
      concessionRows.map((concession) => [concession.id, concession]),
    );

    const mapped = profileRows.map<LiveProvider>((provider) => {
      const contract = contractRows.find(
        (item) => item.provider_id === provider.id && item.active,
      ) ?? contractRows.find((item) => item.provider_id === provider.id);
      const access = accessRows.find((item) => item.profile_id === provider.id);
      const concessionId = contract?.concession_id ?? access?.concession_id ?? "";
      const concession = concessionMap.get(concessionId);

      return {
        id: provider.id,
        name: provider.full_name,
        initials: initials(provider.full_name),
        email: provider.email,
        phone: provider.phone ?? "Non renseigné",
        concessionId,
        concessionName: concession
          ? `${concession.name} · ${concession.city}`
          : "Aucune concession affectée",
        paymentMode: contract?.payment_mode ?? "day",
        rates: {
          day: asNumber(contract?.day_rate),
          vo: asNumber(contract?.vo_rate),
          vn: asNumber(contract?.vn_rate),
          relavage: asNumber(contract?.relavage_rate),
          tres_sale: asNumber(contract?.tres_sale_rate),
          dailyDeduction: asNumber(contract?.daily_deduction),
        },
        status: provider.status,
        vehiclesToday: vehicleRows.filter(
          (vehicle) =>
            vehicle.provider_id === provider.id && vehicle.status === "done",
        ).length,
        monthlyPay: financeRows
          .filter((entry) => entry.provider_id === provider.id)
          .reduce(
            (total, entry) => total + asNumber(entry.provider_amount),
            0,
          ),
      };
    });

    setProviders(mapped);
    setSelected((current) =>
      current ? mapped.find((provider) => provider.id === current.id) ?? null : null,
    );
  }, [supabase]);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setLoading(true);
      await loadData();
      if (active) setLoading(false);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-providers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "provider_contracts" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "concession_access" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        () => void loadData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_entries" },
        () => void loadData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const filtered = useMemo(
    () =>
      providers.filter((provider) => {
        const matches = `${provider.name} ${provider.email} ${provider.concessionName}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matches && (mode === "all" || provider.paymentMode === mode);
      }),
    [providers, query, mode],
  );

  const updateStatus = async (
    provider: LiveProvider,
    status: ProviderStatus,
  ) => {
    setUpdatingStatus(true);
    setError("");

    try {
      const response = await fetch("/api/admin/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id, status }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? `Mise à jour impossible (HTTP ${response.status}).`);
        return;
      }

      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Le serveur ne répond pas.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <section className="panel loading-panel">
        <strong>Chargement des prestataires…</strong>
        <span>Lecture des affectations, contrats et productions</span>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Réseau opérationnel"
        title="Prestataires"
        description="Créez les comptes, affectez les concessions et configurez les rémunérations."
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowCreate(true)}
            disabled={!concessions.length}
          >
            <Icon name="plus" size={18} /> Ajouter un prestataire
          </button>
        }
      />

      {error && (
        <div className="page-alert page-alert--error">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      {!concessions.length && (
        <div className="page-alert page-alert--error">
          <Icon name="building" size={18} />
          Crée d’abord une concession avant d’ajouter un prestataire.
        </div>
      )}

      <section className="compact-stats">
        <div>
          <span className="compact-stats__icon compact-stats__icon--green">
            <Icon name="users" />
          </span>
          <p>
            <strong>
              {providers.filter((provider) => provider.status === "active").length}
            </strong>
            <span>Prestataires actifs</span>
          </p>
        </div>
        <div>
          <span className="compact-stats__icon compact-stats__icon--blue">
            <Icon name="car" />
          </span>
          <p>
            <strong>
              {providers.reduce(
                (total, provider) => total + provider.vehiclesToday,
                0,
              )}
            </strong>
            <span>Véhicules terminés aujourd’hui</span>
          </p>
        </div>
        <div>
          <span className="compact-stats__icon compact-stats__icon--violet">
            <Icon name="wallet" />
          </span>
          <p>
            <strong>
              {formatCurrency(
                providers.reduce(
                  (total, provider) => total + provider.monthlyPay,
                  0,
                ),
              )}
            </strong>
            <span>Rémunérations du mois</span>
          </p>
        </div>
        <div>
          <span className="compact-stats__icon compact-stats__icon--amber">
            <Icon name="warning" />
          </span>
          <p>
            <strong>
              {providers.filter((provider) => provider.status !== "active").length}
            </strong>
            <span>Comptes non actifs</span>
          </p>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-input">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un prestataire…"
            />
          </div>
          <label className="select-control">
            <Icon name="filter" size={17} />
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "all" | PaymentMode)
              }
            >
              <option value="all">Tous les modes</option>
              <option value="day">À la journée</option>
              <option value="vehicle">À la voiture</option>
            </select>
          </label>
        </div>

        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Prestataire</th>
                <th>Concession</th>
                <th>Rémunération</th>
                <th>Production</th>
                <th>Ce mois</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    <div className="person-cell">
                      <span>{provider.initials}</span>
                      <div>
                        <strong>{provider.name}</strong>
                        <small>{provider.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="stacked-cell">
                      <strong>{provider.concessionName.split(" · ")[0]}</strong>
                      <small>{provider.concessionName.split(" · ")[1] ?? ""}</small>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`payment-pill payment-pill--${provider.paymentMode}`}
                    >
                      {provider.paymentMode === "day"
                        ? `${formatCurrency(provider.rates.day)} / jour`
                        : "À la voiture"}
                    </span>
                  </td>
                  <td>
                    <div className="production-cell">
                      <strong>{provider.vehiclesToday}</strong>
                      <span>véhicules</span>
                    </div>
                  </td>
                  <td>
                    <strong>{formatCurrency(provider.monthlyPay)}</strong>
                  </td>
                  <td>
                    <span
                      className={`status-pill status-pill--${provider.status}`}
                    >
                      <i />
                      {statusLabel[provider.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      onClick={() => setSelected(provider)}
                      aria-label={`Voir ${provider.name}`}
                    >
                      <Icon name="arrow" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="table-empty table-empty--panel">
            Aucun prestataire ne correspond à la recherche.
          </div>
        )}
      </section>

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <aside
            className="side-panel"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="side-panel__header">
              <div className="large-avatar">{selected.initials}</div>
              <div>
                <span
                  className={`status-pill status-pill--${selected.status}`}
                >
                  <i />
                  {statusLabel[selected.status]}
                </span>
                <h2>{selected.name}</h2>
                <p>{selected.concessionName}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Fermer"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="side-panel__body">
              <section className="detail-section">
                <h3>Coordonnées</h3>
                <div className="detail-list">
                  <div>
                    <Icon name="mail" size={17} />
                    <span>E-mail</span>
                    <strong>{selected.email}</strong>
                  </div>
                  <div>
                    <Icon name="phone" size={17} />
                    <span>Téléphone</span>
                    <strong>{selected.phone}</strong>
                  </div>
                  <div>
                    <Icon name="building" size={17} />
                    <span>Concession</span>
                    <strong>{selected.concessionName}</strong>
                  </div>
                </div>
              </section>

              <section className="detail-section">
                <h3>Mode de rémunération</h3>
                <div className="payment-card">
                  <span className="payment-card__icon">
                    <Icon name="wallet" />
                  </span>
                  <div>
                    <small>Mode actuel</small>
                    <strong>
                      {selected.paymentMode === "day"
                        ? "Forfait journalier"
                        : "Paiement à la voiture"}
                    </strong>
                    <p>
                      {selected.paymentMode === "day"
                        ? `${formatCurrency(selected.rates.day)} par jour${
                            selected.rates.dailyDeduction
                              ? ` − ${formatCurrency(selected.rates.dailyDeduction)} de retenue`
                              : ""
                          }`
                        : `VO ${formatCurrency(selected.rates.vo)} · VN ${formatCurrency(selected.rates.vn)} · Relavage ${formatCurrency(selected.rates.relavage)} · Très sale ${formatCurrency(selected.rates.tres_sale)}`}
                    </p>
                  </div>
                </div>
              </section>

              <section className="detail-section">
                <h3>Activité</h3>
                <div className="detail-list">
                  <div>
                    <Icon name="car" size={17} />
                    <span>Aujourd’hui</span>
                    <strong>{selected.vehiclesToday} véhicule(s)</strong>
                  </div>
                  <div>
                    <Icon name="calendar" size={17} />
                    <span>Ce mois</span>
                    <strong>{formatCurrency(selected.monthlyPay)}</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="side-panel__footer">
              <button
                type="button"
                className={
                  selected.status === "active"
                    ? "secondary-button secondary-button--wide"
                    : "primary-button primary-button--wide"
                }
                disabled={updatingStatus}
                onClick={() =>
                  void updateStatus(
                    selected,
                    selected.status === "active" ? "inactive" : "active",
                  )
                }
              >
                {updatingStatus
                  ? "Mise à jour…"
                  : selected.status === "active"
                    ? "Désactiver le compte"
                    : "Réactiver le compte"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {showCreate && (
        <CreateProviderModal
          concessions={concessions}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void loadData();
          }}
        />
      )}
    </>
  );
}
