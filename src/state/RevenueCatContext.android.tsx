import React, { createContext, useContext, type ReactNode } from 'react';

export type RevenueCatPaywallResult =
  | 'PURCHASED'
  | 'RESTORED'
  | 'CANCELLED'
  | 'ERROR'
  | 'NOT_PRESENTED';

type RevenueCatState = {
  isSupported: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  isPro: boolean;
  customerInfo: null;
  offerings: null;
  currentOffering: null;
  availablePackages: never[];
  refreshCustomerInfo: () => Promise<null>;
  purchasePackage: (_plan: 'monthly' | 'yearly') => Promise<null>;
  restorePurchases: () => Promise<null>;
  presentPaywall: () => Promise<RevenueCatPaywallResult>;
  presentCustomerCenter: () => Promise<void>;
};

const RevenueCatContext = createContext<RevenueCatState>({
  isSupported: false,
  isConfigured: false,
  isLoading: false,
  isPro: false,
  customerInfo: null,
  offerings: null,
  currentOffering: null,
  availablePackages: [],
  refreshCustomerInfo: async () => null,
  purchasePackage: async () => null,
  restorePurchases: async () => null,
  presentPaywall: async () => 'NOT_PRESENTED',
  presentCustomerCenter: async () => undefined,
});
const defaultRevenueCatState = {
  isSupported: false,
  isConfigured: false,
  isLoading: false,
  isPro: false,
  customerInfo: null,
  offerings: null,
  currentOffering: null,
  availablePackages: [],
  refreshCustomerInfo: async () => null,
  purchasePackage: async () => null,
  restorePurchases: async () => null,
  presentPaywall: async () => 'NOT_PRESENTED' as RevenueCatPaywallResult,
  presentCustomerCenter: async () => undefined,
} satisfies RevenueCatState;

export function useRevenueCat() {
  return useContext(RevenueCatContext);
}

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  return (
    <RevenueCatContext.Provider value={defaultRevenueCatState}>
      {children}
    </RevenueCatContext.Provider>
  );
}
