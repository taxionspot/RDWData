"use client";

import { createContext, useContext } from "react";

/**
 * Lets any PremiumLock deep in the report open the SINGLE page-level
 * SubscriptionModal instead of mounting its own. Null outside the report
 * (standalone screens), where PremiumLock falls back to a local modal.
 */
export const PageUnlockContext = createContext<(() => void) | null>(null);

export function usePageUnlock(): (() => void) | null {
  return useContext(PageUnlockContext);
}
