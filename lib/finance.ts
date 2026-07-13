import type { FinanceSummary, Provider, Vehicle } from "./types";

export const providerCostForVehicle = (vehicle: Vehicle, provider?: Provider) => {
  if (!provider || provider.paymentMode !== "vehicle") return 0;
  return provider.rates[vehicle.billingType] ?? 0;
};

export function calculateDailyFinance(
  vehicles: Vehicle[],
  providerList: Provider[],
): FinanceSummary {
  const completed = vehicles.filter((vehicle) => vehicle.status === "done");
  const billed = completed.reduce((total, vehicle) => total + vehicle.billedAmount, 0);

  const providersById = new Map(providerList.map((provider) => [provider.id, provider]));
  const activeProviderDays = new Set<string>();

  let providerCost = completed.reduce((total, vehicle) => {
    const provider = vehicle.providerId ? providersById.get(vehicle.providerId) : undefined;
    if (!provider) return total;

    if (provider.paymentMode === "day") {
      activeProviderDays.add(provider.id);
      return total;
    }

    return total + providerCostForVehicle(vehicle, provider);
  }, 0);

  for (const providerId of activeProviderDays) {
    const provider = providersById.get(providerId);
    if (provider) providerCost += provider.rates.day;
  }

  const grossMargin = billed - providerCost;
  return {
    billed,
    providerCost,
    grossMargin,
    marginRate: billed > 0 ? (grossMargin / billed) * 100 : 0,
    completedVehicles: completed.length,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
