export type Role = "admin" | "concession" | "prestataire" | "directeur";
export type VehicleStatus = "waiting" | "washing" | "done";
export type BillingType = "vo" | "vn" | "relavage" | "tres_sale";
export type PaymentMode = "day" | "vehicle";
export type BillingMode = "day" | "vehicle";
export type ServiceType = "Mécanique" | "Service rapide" | "Carrosserie" | "VO/VN";

export interface AppProfile {
  id: string;
  fullName: string;
  role: Role;
  status: "pending" | "active" | "inactive";
  organizationId: string;
}

export interface Concession {
  id: string;
  name: string;
  city: string;
  address: string;
  manager: string;
  email: string;
  activeProviders: number;
  targetPerDay: number;
  billedDayRate: number;
  billedRates?: Record<BillingType, number>;
}

export interface ProviderRates {
  day: number;
  vo: number;
  vn: number;
  relavage: number;
  tres_sale: number;
  dailyDeduction: number;
}

export interface Provider {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  concessionId: string;
  concessionName: string;
  paymentMode: PaymentMode;
  rates: ProviderRates;
  status: "active" | "pending" | "inactive";
  vehiclesToday: number;
  monthlyPay: number;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  service: ServiceType;
  billingType: BillingType;
  status: VehicleStatus;
  returnTime: string;
  urgent: boolean;
  customerWaiting: boolean;
  providerId?: string;
  providerName?: string;
  createdBy?: string;
  concessionId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  billedAmount: number;
  providerAmount?: number;
}

export interface FinanceSummary {
  billed: number;
  providerCost: number;
  grossMargin: number;
  marginRate: number;
  completedVehicles: number;
}
