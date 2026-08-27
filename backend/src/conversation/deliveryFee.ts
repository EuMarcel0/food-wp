import type { DeliveryNeighborhood, Store } from "../types.js";

function normalizePlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addressHasNeighborhood(address: string, neighborhood: string) {
  const hay = normalizePlace(address);
  const needle = normalizePlace(neighborhood);
  if (!hay || !needle) return false;
  const pattern = escapeRegExp(needle).replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`).test(hay);
}

export function resolveDeliveryFee(
  store: Pick<Store, "deliveryFeeCents" | "neighborhoods">,
  options: { neighborhoodId?: string; address?: string } = {},
): { cents: number; neighborhood: DeliveryNeighborhood | null } {
  const zones = store.neighborhoods ?? [];
  if (options.neighborhoodId) {
    const chosen = zones.find((zone) => zone.id === options.neighborhoodId);
    if (chosen) {
      return { cents: Math.max(0, chosen.feeCents), neighborhood: chosen };
    }
  }

  const ranked = [...zones].sort(
    (left, right) => right.name.length - left.name.length,
  );
  const match = ranked.find((zone) =>
    addressHasNeighborhood(options.address ?? "", zone.name),
  );
  if (match) return { cents: Math.max(0, match.feeCents), neighborhood: match };
  return { cents: Math.max(0, store.deliveryFeeCents), neighborhood: null };
}
