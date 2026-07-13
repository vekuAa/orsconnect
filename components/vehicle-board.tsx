"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type {
  AppProfile,
  BillingMode,
  BillingType,
  PaymentMode,
  Role,
  ServiceType,
  Vehicle,
  VehicleStatus,
} from "@/lib/types";
import { Icon } from "./icons";
import { PageHeader } from "./page-header";

const statusMeta: Record<
  VehicleStatus,
  { label: string; icon: "clock" | "car" | "check" }
> = {
  waiting: { label: "À laver", icon: "clock" },
  washing: { label: "En lavage", icon: "car" },
  done: { label: "Lavés", icon: "check" },
};

const billingLabels: Record<BillingType, string> = {
  vo: "VO",
  vn: "VN",
  relavage: "Relavage",
  tres_sale: "Très sale",
};

const serviceToDb: Record<ServiceType, string> = {
  Mécanique: "mecanique",
  "Service rapide": "service_rapide",
  Carrosserie: "carrosserie",
  "VO/VN": "vo_vn",
};

const serviceFromDb: Record<string, ServiceType> = {
  mecanique: "Mécanique",
  service_rapide: "Service rapide",
  carrosserie: "Carrosserie",
  vo_vn: "VO/VN",
};

interface LiveConcession {
  id: string;
  name: string;
  city: string;
  address: string;
  dailyTarget: number;
  billingMode: BillingMode;
  billedDayRate: number;
  billedRates: Record<BillingType, number>;
}

interface LiveProvider {
  id: string;
  fullName: string;
}

interface FinancialRow {
  billed_amount: number | string;
  provider_amount: number | string;
  operational_fees: number | string;
}

interface DbVehicleRow {
  id: string;
  concession_id: string;
  plate: string;
  model: string | null;
  service: string;
  billing_type: BillingType;
  status: VehicleStatus | "cancelled";
  return_time: string | null;
  urgent: boolean;
  customer_waiting: boolean;
  provider_id: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  billed_amount: number | string;
  provider_amount: number | string;
}

interface VehicleFormValues {
  plate: string;
  model: string;
  service: ServiceType;
  billingType: BillingType;
  returnTime: string;
  urgent: boolean;
  customerWaiting: boolean;
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function elapsed(startedAt?: string, completedAt?: string) {
  if (!startedAt) return "—";
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const minutes = Math.max(
    1,
    Math.round((end - new Date(startedAt).getTime()) / 60000),
  );
  return `${minutes} min`;
}

function mapVehicle(
  row: DbVehicleRow,
  providerNames: Map<string, string>,
): Vehicle {
  return {
    id: row.id,
    plate: row.plate,
    model: row.model || "Modèle non précisé",
    service: serviceFromDb[row.service] ?? "Mécanique",
    billingType: row.billing_type,
    status: row.status === "cancelled" ? "waiting" : row.status,
    returnTime: row.return_time?.slice(0, 5) ?? "—",
    urgent: row.urgent,
    customerWaiting: row.customer_waiting,
    providerId: row.provider_id ?? undefined,
    providerName: row.provider_id
      ? providerNames.get(row.provider_id)
      : undefined,
    createdBy: row.created_by ?? undefined,
    concessionId: row.concession_id,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    billedAmount: asNumber(row.billed_amount),
    providerAmount: asNumber(row.provider_amount),
  };
}

function VehicleCard({
  vehicle,
  onMove,
  onEdit,
  onDelete,
  canManage,
  busy,
  showBilling,
  showCategory,
  billingMode,
}: {
  vehicle: Vehicle;
  onMove: (id: string, status: VehicleStatus) => void;
  onEdit: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
  canManage: boolean;
  busy: boolean;
  showBilling: boolean;
  showCategory: boolean;
  billingMode: BillingMode;
}) {
  const nextStatus: VehicleStatus | null =
    vehicle.status === "waiting"
      ? "washing"
      : vehicle.status === "washing"
        ? "done"
        : null;
  const nextLabel =
    vehicle.status === "waiting"
      ? "Démarrer"
      : vehicle.status === "washing"
        ? "Terminer"
        : null;

  return (
    <article
      className={`vehicle-card ${vehicle.urgent ? "vehicle-card--urgent" : ""}`}
    >
      <div className="vehicle-card__top">
        <div className="plate-block">
          <strong>{vehicle.plate}</strong>
          <span>{vehicle.model}</span>
        </div>
        {canManage && (
          <div className="vehicle-card__tools">
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={() => onEdit(vehicle)}
              aria-label={`Modifier ${vehicle.plate}`}
              disabled={busy}
              title="Modifier"
            >
              <Icon name="edit" size={17} />
            </button>
            <button
              type="button"
              className="icon-button icon-button--small icon-button--danger"
              onClick={() => onDelete(vehicle)}
              aria-label={`Supprimer ${vehicle.plate}`}
              disabled={busy}
              title="Supprimer"
            >
              <Icon name="trash" size={17} />
            </button>
          </div>
        )}
      </div>

      <div className="vehicle-tags">
        {showCategory && (
          <span className={`billing-tag billing-tag--${vehicle.billingType}`}>
            {billingLabels[vehicle.billingType]}
          </span>
        )}
        <span className="neutral-tag">{vehicle.service}</span>
        {vehicle.urgent && (
          <span className="urgent-tag">
            <Icon name="warning" size={12} /> Urgent
          </span>
        )}
        {vehicle.customerWaiting && (
          <span className="customer-tag">Client sur place</span>
        )}
      </div>

      <div className="vehicle-card__info">
        <div>
          <span>Restitution</span>
          <strong>
            <Icon name="clock" size={14} />
            {vehicle.returnTime}
          </strong>
        </div>
        {vehicle.status !== "waiting" && (
          <div>
            <span>
              {vehicle.status === "washing" ? "Temps en cours" : "Durée"}
            </span>
            <strong>{elapsed(vehicle.startedAt, vehicle.completedAt)}</strong>
          </div>
        )}
      </div>

      {vehicle.providerName && (
        <div className="assigned-provider">
          <span>
            {vehicle.providerName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div>
            <small>Pris en charge par</small>
            <strong>{vehicle.providerName}</strong>
          </div>
        </div>
      )}

      {nextStatus && nextLabel && (
        <button
          type="button"
          className={`vehicle-action vehicle-action--${vehicle.status}`}
          onClick={() => onMove(vehicle.id, nextStatus)}
          disabled={busy}
        >
          {busy ? "Traitement…" : nextLabel}
          {!busy && (
            <Icon
              name={vehicle.status === "waiting" ? "arrow" : "check"}
              size={16}
            />
          )}
        </button>
      )}

      {vehicle.status === "done" && (
        <div className="completed-line">
          <Icon name="check" size={15} />
          Terminé à{" "}
          {vehicle.completedAt
            ? new Date(vehicle.completedAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
          {showBilling && (
            <strong>
              {billingMode === "day"
                ? "Forfait jour"
                : formatCurrency(vehicle.billedAmount)}
            </strong>
          )}
        </div>
      )}
    </article>
  );
}

function VehicleFormModal({
  mode,
  concession,
  profileRole,
  providerPaymentMode,
  currentUserId,
  vehicle,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  concession: LiveConcession;
  profileRole: Role;
  providerPaymentMode?: PaymentMode;
  currentUserId: string;
  vehicle?: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<VehicleFormValues>({
    plate: vehicle?.plate ?? "",
    model:
      vehicle?.model && vehicle.model !== "Modèle non précisé"
        ? vehicle.model
        : "",
    service: vehicle?.service ?? "Mécanique",
    billingType: vehicle?.billingType ?? "vo",
    returnTime:
      vehicle?.returnTime && vehicle.returnTime !== "—"
        ? vehicle.returnTime
        : "17:00",
    urgent: vehicle?.urgent ?? false,
    customerWaiting: vehicle?.customerWaiting ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const categoryRequired =
    concession.billingMode === "vehicle" ||
    providerPaymentMode === "vehicle";
  const showPrices = profileRole === "admin" || profileRole === "directeur";

  useEffect(() => {
    setMounted(true);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [onClose]);

  const patchValue = <K extends keyof VehicleFormValues>(
    key: K,
    value: VehicleFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.plate.trim()) return;

    setLoading(true);
    setError("");

    if (mode === "create") {
      const { error: insertError } = await supabase.from("vehicles").insert({
        concession_id: concession.id,
        plate: values.plate.trim().toUpperCase(),
        model: values.model.trim() || null,
        service: serviceToDb[values.service],
        billing_type: categoryRequired ? values.billingType : "vo",
        status: "waiting",
        return_time: values.returnTime || null,
        urgent: values.urgent,
        customer_waiting: values.customerWaiting,
        created_by: currentUserId,
      });

      if (insertError) {
        setError(
          insertError.code === "23505"
            ? "Cette plaque a déjà été ajoutée aujourd’hui."
            : insertError.message,
        );
        setLoading(false);
        return;
      }
    } else if (vehicle) {
      const { error: updateError } = await supabase.rpc(
        "update_vehicle_details",
        {
          p_vehicle_id: vehicle.id,
          p_plate: values.plate.trim().toUpperCase(),
          p_model: values.model.trim() || null,
          p_service: serviceToDb[values.service],
          p_billing_type: categoryRequired ? values.billingType : "vo",
          p_return_time: values.returnTime || null,
          p_urgent: values.urgent,
          p_customer_waiting: values.customerWaiting,
        },
      );

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    }

    onSaved();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">
              {mode === "create" ? "Nouveau flux" : "Correction du véhicule"}
            </span>
            <h2 id="vehicle-form-title">
              {mode === "create" ? "Ajouter un véhicule" : "Modifier le véhicule"}
            </h2>
            <p>
              {mode === "create"
                ? "Le véhicule sera visible immédiatement par le prestataire et la concession."
                : "Les montants sont recalculés automatiquement si le véhicule est déjà terminé."}
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
          <div className="form-grid">
            <label className="field-group">
              <span>Immatriculation *</span>
              <input
                value={values.plate}
                onChange={(event) => patchValue("plate", event.target.value)}
                placeholder="AB-123-CD"
                required
                autoFocus
              />
            </label>
            <label className="field-group">
              <span>Modèle</span>
              <input
                value={values.model}
                onChange={(event) => patchValue("model", event.target.value)}
                placeholder="Peugeot 3008"
              />
            </label>
            <label className="field-group">
              <span>Service</span>
              <select
                value={values.service}
                onChange={(event) =>
                  patchValue("service", event.target.value as ServiceType)
                }
              >
                <option>Mécanique</option>
                <option>Service rapide</option>
                <option>Carrosserie</option>
                <option>VO/VN</option>
              </select>
            </label>

            {categoryRequired ? (
              <label className="field-group">
                <span>Type de prestation</span>
                <select
                  value={values.billingType}
                  onChange={(event) =>
                    patchValue(
                      "billingType",
                      event.target.value as BillingType,
                    )
                  }
                >
                  {(Object.keys(billingLabels) as BillingType[]).map((type) => (
                    <option value={type} key={type}>
                      {billingLabels[type]}
                      {showPrices && concession.billingMode === "vehicle"
                        ? ` — ${formatCurrency(concession.billedRates[type])}`
                        : ""}
                    </option>
                  ))}
                </select>
                <small>
                  {profileRole === "prestataire"
                    ? "Aucun tarif concession n’est affiché dans l’espace prestataire."
                    : concession.billingMode === "day"
                      ? "La concession est au forfait jour ; ce type sert seulement si le prestataire est payé à la voiture."
                      : "Le tarif concession est calculé automatiquement par Supabase."}
                </small>
              </label>
            ) : (
              <div className="form-information-card">
                <Icon name="calendar" size={18} />
                <div>
                  <strong>Forfait journalier</strong>
                  <span>
                    Aucun prix ni type de véhicule n’est à choisir pour ce
                    contrat.
                  </span>
                </div>
              </div>
            )}

            <label className="field-group">
              <span>Heure de restitution</span>
              <input
                type="time"
                value={values.returnTime}
                onChange={(event) =>
                  patchValue("returnTime", event.target.value)
                }
              />
            </label>
          </div>

          <div className="toggle-grid">
            <label className="check-option">
              <input
                type="checkbox"
                checked={values.urgent}
                onChange={(event) =>
                  patchValue("urgent", event.target.checked)
                }
              />
              <span>
                <Icon name="warning" size={17} />
                <b>Véhicule urgent</b>
                <small>À traiter en priorité</small>
              </span>
            </label>
            <label className="check-option">
              <input
                type="checkbox"
                checked={values.customerWaiting}
                onChange={(event) =>
                  patchValue("customerWaiting", event.target.checked)
                }
              />
              <span>
                <Icon name="users" size={17} />
                <b>Client sur place</b>
                <small>Le client attend le véhicule</small>
              </span>
            </label>
          </div>

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
                : mode === "create"
                  ? "Ajouter le véhicule"
                  : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function VehicleBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const profileRef = useRef<AppProfile | null>(null);
  const [concessions, setConcessions] = useState<LiveConcession[]>([]);
  const [selectedConcessionId, setSelectedConcessionId] = useState("");
  const [providers, setProviders] = useState<LiveProvider[]>([]);
  const [providerPaymentModes, setProviderPaymentModes] = useState<
    Record<string, PaymentMode>
  >({});
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [financialRows, setFinancialRows] = useState<FinancialRow[]>([]);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyVehicleId, setBusyVehicleId] = useState("");
  const [error, setError] = useState("");

  const loadBoard = useCallback(
    async (concessionId: string, currentProfile?: AppProfile | null) => {
      if (!concessionId) return;
      setError("");

      const effectiveProfile = currentProfile ?? profileRef.current;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const today = new Intl.DateTimeFormat("fr-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const [accessResult, vehicleResult] = await Promise.all([
        supabase
          .from("concession_access")
          .select("profile_id")
          .eq("concession_id", concessionId),
        supabase
          .from("vehicles")
          .select(
            "id, concession_id, plate, model, service, billing_type, status, return_time, urgent, customer_waiting, provider_id, created_by, created_at, started_at, completed_at, billed_amount, provider_amount",
          )
          .eq("concession_id", concessionId)
          .neq("status", "cancelled")
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: true }),
      ]);

      if (accessResult.error || vehicleResult.error) {
        setError(
          accessResult.error?.message ??
            vehicleResult.error?.message ??
            "Chargement impossible.",
        );
        return;
      }

      const profileIds = [
        ...new Set(
          (accessResult.data ?? []).map((row) => row.profile_id as string),
        ),
      ];
      let providerRows: Array<{ id: string; full_name: string }> = [];

      if (profileIds.length) {
        const { data, error: providerError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds)
          .eq("role", "prestataire")
          .eq("status", "active")
          .order("full_name");
        if (providerError) setError(providerError.message);
        providerRows = data ?? [];
      }

      const liveProviders = providerRows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
      }));
      const providerNames = new Map(
        liveProviders.map((provider) => [provider.id, provider.fullName]),
      );
      setProviders(liveProviders);

      if (effectiveProfile?.role === "prestataire") {
        setSelectedProviderId(effectiveProfile.id);
      } else {
        setSelectedProviderId((current) =>
          liveProviders.some((provider) => provider.id === current)
            ? current
            : (liveProviders[0]?.id ?? ""),
        );
      }

      setVehicles(
        ((vehicleResult.data as DbVehicleRow[] | null) ?? []).map((row) =>
          mapVehicle(row, providerNames),
        ),
      );

      if (
        effectiveProfile?.role === "admin" ||
        effectiveProfile?.role === "directeur" ||
        effectiveProfile?.role === "prestataire"
      ) {
        let contractQuery = supabase
          .from("provider_contracts")
          .select("provider_id, payment_mode")
          .eq("concession_id", concessionId)
          .eq("active", true)
          .lte("starts_on", today)
          .or(`ends_on.is.null,ends_on.gte.${today}`);

        if (effectiveProfile.role === "prestataire") {
          contractQuery = contractQuery.eq(
            "provider_id",
            effectiveProfile.id,
          );
        }

        const { data: contractRows, error: contractError } =
          await contractQuery;
        if (!contractError) {
          setProviderPaymentModes(
            Object.fromEntries(
              (contractRows ?? []).map((row) => [
                row.provider_id as string,
                row.payment_mode as PaymentMode,
              ]),
            ),
          );
        }
      } else {
        setProviderPaymentModes({});
      }

      if (
        effectiveProfile?.role === "admin" ||
        effectiveProfile?.role === "directeur"
      ) {
        const { data: financeData, error: financeError } = await supabase
          .from("financial_entries")
          .select("billed_amount, provider_amount, operational_fees")
          .eq("concession_id", concessionId)
          .eq("entry_date", today);
        if (financeError) setError(financeError.message);
        else setFinancialRows((financeData ?? []) as FinancialRow[]);
      } else {
        setFinancialRows([]);
      }
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const [profileResult, concessionResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, organization_id, full_name, role, status")
          .eq("id", user.id)
          .single(),
        supabase
          .from("concessions")
          .select(
            "id, name, city, address, daily_target, billing_mode, billed_day_rate, billed_vo_rate, billed_vn_rate, billed_relavage_rate, billed_tres_sale_rate",
          )
          .eq("active", true)
          .is("archived_at", null)
          .order("name"),
      ]);

      if (!active) return;
      if (
        profileResult.error ||
        concessionResult.error ||
        !profileResult.data
      ) {
        setError(
          profileResult.error?.message ??
            concessionResult.error?.message ??
            "Profil introuvable.",
        );
        setLoading(false);
        return;
      }

      const row = profileResult.data;
      const currentProfile: AppProfile = {
        id: row.id,
        organizationId: row.organization_id,
        fullName: row.full_name,
        role: row.role as Role,
        status: row.status,
      };
      profileRef.current = currentProfile;
      setProfile(currentProfile);

      const mappedConcessions: LiveConcession[] = (
        concessionResult.data ?? []
      ).map((concession) => ({
        id: concession.id,
        name: concession.name,
        city: concession.city,
        address: concession.address,
        dailyTarget: concession.daily_target,
        billingMode: concession.billing_mode as BillingMode,
        billedDayRate: asNumber(concession.billed_day_rate),
        billedRates: {
          vo: asNumber(concession.billed_vo_rate),
          vn: asNumber(concession.billed_vn_rate),
          relavage: asNumber(concession.billed_relavage_rate),
          tres_sale: asNumber(concession.billed_tres_sale_rate),
        },
      }));

      setConcessions(mappedConcessions);
      const requestedSite =
        new URLSearchParams(window.location.search).get("site") ?? "";
      const firstId = mappedConcessions.some(
        (concession) => concession.id === requestedSite,
      )
        ? requestedSite
        : (mappedConcessions[0]?.id ?? "");
      setSelectedConcessionId(firstId);
      if (firstId) await loadBoard(firstId, currentProfile);
      setLoading(false);
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [loadBoard, supabase]);

  useEffect(() => {
    if (!selectedConcessionId || !profile) return;

    const channel = supabase
      .channel(`vehicles-${selectedConcessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicles",
          filter: `concession_id=eq.${selectedConcessionId}`,
        },
        () => void loadBoard(selectedConcessionId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBoard, profile, selectedConcessionId, supabase]);

  const changeConcession = async (id: string) => {
    setSelectedConcessionId(id);
    setLoading(true);
    await loadBoard(id);
    setLoading(false);
  };

  const filtered = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const matchesQuery = `${vehicle.plate} ${vehicle.model}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return (
          matchesQuery &&
          (service === "all" || vehicle.service === service)
        );
      }),
    [vehicles, query, service],
  );

  const finance = useMemo(() => {
    const billed = financialRows.reduce(
      (total, row) => total + asNumber(row.billed_amount),
      0,
    );
    const providerCost = financialRows.reduce(
      (total, row) => total + asNumber(row.provider_amount),
      0,
    );
    const fees = financialRows.reduce(
      (total, row) => total + asNumber(row.operational_fees),
      0,
    );
    return { billed, providerCost, grossMargin: billed - providerCost - fees };
  }, [financialRows]);

  const moveVehicle = async (id: string, status: VehicleStatus) => {
    setError("");
    setBusyVehicleId(id);

    if (status === "washing") {
      const providerId =
        profile?.role === "prestataire" ? profile.id : selectedProviderId;
      if (!providerId) {
        setError(
          "Aucun prestataire actif n’est affecté à cette concession.",
        );
        setBusyVehicleId("");
        return;
      }

      const { error: rpcError } = await supabase.rpc("start_vehicle", {
        p_vehicle_id: id,
        p_provider_id: providerId,
      });
      if (rpcError) setError(rpcError.message);
    } else if (status === "done") {
      const { error: rpcError } = await supabase.rpc("complete_vehicle", {
        p_vehicle_id: id,
      });
      if (rpcError) setError(rpcError.message);
    }

    await loadBoard(selectedConcessionId);
    setBusyVehicleId("");
  };

  const deleteVehicle = async (vehicle: Vehicle) => {
    const accepted = window.confirm(
      `Supprimer ${vehicle.plate} du suivi ? L’opération restera archivée pour la traçabilité.`,
    );
    if (!accepted) return;

    setBusyVehicleId(vehicle.id);
    setError("");
    const { error: rpcError } = await supabase.rpc("cancel_vehicle", {
      p_vehicle_id: vehicle.id,
    });
    if (rpcError) setError(rpcError.message);
    await loadBoard(selectedConcessionId);
    setBusyVehicleId("");
  };

  const canManageVehicle = (vehicle: Vehicle) => {
    if (!profile) return false;
    if (["admin", "directeur", "concession"].includes(profile.role)) {
      return true;
    }
    return (
      profile.role === "prestataire" &&
      (vehicle.createdBy === profile.id || vehicle.providerId === profile.id)
    );
  };

  const selectedConcession = concessions.find(
    (concession) => concession.id === selectedConcessionId,
  );
  const managementView =
    profile?.role === "admin" || profile?.role === "directeur";
  const activeProviderId =
    profile?.role === "prestataire" ? profile.id : selectedProviderId;
  const activeProviderPaymentMode = activeProviderId
    ? providerPaymentModes[activeProviderId]
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Production en temps réel"
        title="Suivi des véhicules"
        description="Ajoutez, corrigez et clôturez les véhicules en temps réel."
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowCreateModal(true)}
            disabled={!selectedConcession}
          >
            <Icon name="plus" size={18} /> Ajouter un véhicule
          </button>
        }
      />

      <section className="operations-strip">
        <label className="operations-strip__site operations-site-select">
          <span className="site-icon">
            <Icon name="building" />
          </span>
          <div>
            <small>Concession active</small>
            <select
              value={selectedConcessionId}
              onChange={(event) => void changeConcession(event.target.value)}
            >
              {concessions.map((concession) => (
                <option value={concession.id} key={concession.id}>
                  {concession.name} · {concession.city}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="operations-strip__metrics">
          <div>
            <span>Facturé</span>
            <strong>
              {managementView ? formatCurrency(finance.billed) : "Accès ORS"}
            </strong>
          </div>
          <div>
            <span>Prestataires</span>
            <strong>
              {managementView
                ? formatCurrency(finance.providerCost)
                : providers.length}
            </strong>
          </div>
          <div className="metric-highlight">
            <span>Marge ORS</span>
            <strong>
              {managementView
                ? formatCurrency(finance.grossMargin)
                : "Masquée"}
            </strong>
          </div>
        </div>
      </section>

      {profile && profile.role !== "prestataire" && (
        <section className="provider-assignment-bar">
          <div>
            <Icon name="users" size={18} />
            <span>Prestataire affecté au prochain démarrage</span>
          </div>
          <select
            value={selectedProviderId}
            onChange={(event) => setSelectedProviderId(event.target.value)}
          >
            {providers.length ? (
              providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.fullName}
                </option>
              ))
            ) : (
              <option value="">Aucun prestataire actif</option>
            )}
          </select>
        </section>
      )}

      {error && (
        <div className="page-alert page-alert--error">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      <section className="toolbar">
        <div className="search-input">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une plaque ou un modèle…"
          />
        </div>
        <div className="toolbar__right">
          <label className="select-control">
            <Icon name="filter" size={17} />
            <select
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              <option value="all">Tous les services</option>
              <option>Mécanique</option>
              <option>Service rapide</option>
              <option>Carrosserie</option>
              <option>VO/VN</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void loadBoard(selectedConcessionId)}
            disabled={loading}
          >
            Actualiser
          </button>
        </div>
      </section>

      {loading ? (
        <section className="panel loading-panel">
          <strong>Chargement des véhicules…</strong>
          <span>Connexion sécurisée à Supabase</span>
        </section>
      ) : (
        <section className="kanban-board">
          {(Object.keys(statusMeta) as VehicleStatus[]).map((status) => {
            const items = filtered.filter(
              (vehicle) => vehicle.status === status,
            );
            return (
              <div
                className={`kanban-column kanban-column--${status}`}
                key={status}
              >
                <div className="kanban-column__header">
                  <div>
                    <span className="kanban-status-icon">
                      <Icon name={statusMeta[status].icon} size={17} />
                    </span>
                    <strong>{statusMeta[status].label}</strong>
                    <i>{items.length}</i>
                  </div>
                  <span>
                    {status === "waiting"
                      ? "En file"
                      : status === "washing"
                        ? "En cours"
                        : "Aujourd’hui"}
                  </span>
                </div>
                <div className="kanban-column__cards">
                  {items.length ? (
                    items.map((vehicle) => {
                      const vehicleProviderMode = vehicle.providerId
                        ? providerPaymentModes[vehicle.providerId]
                        : activeProviderPaymentMode;
                      const showCategory =
                        selectedConcession?.billingMode === "vehicle" ||
                        vehicleProviderMode === "vehicle";

                      return (
                        <VehicleCard
                          key={vehicle.id}
                          vehicle={vehicle}
                          onMove={moveVehicle}
                          onEdit={setEditingVehicle}
                          onDelete={deleteVehicle}
                          canManage={canManageVehicle(vehicle)}
                          busy={busyVehicleId === vehicle.id}
                          showBilling={managementView}
                          showCategory={showCategory}
                          billingMode={
                            selectedConcession?.billingMode ?? "vehicle"
                          }
                        />
                      );
                    })
                  ) : (
                    <div className="empty-column">
                      <Icon name={statusMeta[status].icon} size={25} />
                      <strong>Aucun véhicule</strong>
                      <span>Les véhicules apparaîtront ici.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {showCreateModal && selectedConcession && profile && (
        <VehicleFormModal
          mode="create"
          concession={selectedConcession}
          profileRole={profile.role}
          providerPaymentMode={activeProviderPaymentMode}
          currentUserId={profile.id}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            void loadBoard(selectedConcessionId);
          }}
        />
      )}

      {editingVehicle && selectedConcession && profile && (
        <VehicleFormModal
          mode="edit"
          concession={selectedConcession}
          profileRole={profile.role}
          providerPaymentMode={
            editingVehicle.providerId
              ? providerPaymentModes[editingVehicle.providerId]
              : activeProviderPaymentMode
          }
          currentUserId={profile.id}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={() => {
            setEditingVehicle(null);
            void loadBoard(selectedConcessionId);
          }}
        />
      )}
    </>
  );
}
