type DataLayerObject = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: DataLayerObject[];
  }
}

const REPORT_ITEM = {
  item_id: "kentekenrapport-unlock",
  item_name: "Kentekenrapport full unlock"
};

export function pushToDataLayer(data: DataLayerObject): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(data);
}

export function trackPlateSearch(plate: string): void {
  pushToDataLayer({ event: "plate_search", plate });
}

export function trackBeginCheckout(args: { plate: string; value: number; currency: string }): void {
  // Reset the ecommerce object first so GTM does not merge stale data between events.
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: "begin_checkout",
    plate: args.plate,
    ecommerce: {
      value: args.value,
      currency: args.currency,
      items: [{ ...REPORT_ITEM, price: args.value, quantity: 1 }]
    }
  });
}

export function trackPurchase(args: {
  transactionId: string;
  plate: string;
  value: number;
  currency: string;
}): void {
  pushToDataLayer({ ecommerce: null });
  pushToDataLayer({
    event: "purchase",
    plate: args.plate,
    ecommerce: {
      transaction_id: args.transactionId,
      value: args.value,
      currency: args.currency,
      items: [{ ...REPORT_ITEM, price: args.value, quantity: 1 }]
    }
  });
}
