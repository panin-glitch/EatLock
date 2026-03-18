import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import type PurchasesDefault from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import type RevenueCatUIDefault from 'react-native-purchases-ui';
import { ENV } from '../config/env';
import { useAuth } from './AuthContext';
import {
  findPackageForPlan,
  formatRevenueCatError,
  getConfiguredOffering,
  hasTadLockProEntitlement,
  isPurchaseCancelledError,
  isRevenueCatEnabledForPlatform,
  PAYWALL_RESULTS,
  type PaywallResult,
  type RevenueCatPlan,
} from '../services/revenueCat';

const __DEV__ = process.env.NODE_ENV !== 'production';

type PurchasesModule = typeof PurchasesDefault & {
  default?: typeof PurchasesDefault;
};

type RevenueCatUIModule = {
  default?: typeof RevenueCatUIDefault;
};

function getPurchases(): typeof PurchasesDefault {
  const module = require('react-native-purchases') as PurchasesModule;
  return (module.default ?? module) as typeof PurchasesDefault;
}

function getRevenueCatUI(): typeof RevenueCatUIDefault {
  const module = require('react-native-purchases-ui') as RevenueCatUIModule;
  return (module.default ?? module) as typeof RevenueCatUIDefault;
}

interface RevenueCatState {
  isSupported: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  currentOffering: PurchasesOffering | null;
  availablePackages: PurchasesPackage[];
  refreshCustomerInfo: () => Promise<CustomerInfo | null>;
  purchasePackage: (plan: RevenueCatPlan) => Promise<CustomerInfo | null>;
  restorePurchases: () => Promise<CustomerInfo | null>;
  presentPaywall: () => Promise<PaywallResult>;
  presentCustomerCenter: () => Promise<void>;
}

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
  presentPaywall: async () => PAYWALL_RESULTS.NOT_PRESENTED,
  presentCustomerCenter: async () => undefined,
});

export function useRevenueCat() {
  return useContext(RevenueCatContext);
}

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isSupported = isRevenueCatEnabledForPlatform(Platform.OS);
  const isSignedInAccount = Boolean(user?.id && user?.email);
  const configuredRef = useRef(false);
  const currentAppUserIdRef = useRef<string | null>(null);

  const clearState = useCallback(() => {
    setCustomerInfo(null);
    setOfferings(null);
  }, []);

  const currentOffering = useMemo(() => getConfiguredOffering(offerings), [offerings]);
  const availablePackages = currentOffering?.availablePackages ?? [];
  const isPro = hasTadLockProEntitlement(customerInfo);

  const ensureEligibleUser = useCallback(() => {
    if (!isSupported) {
      throw new Error('Subscriptions are currently available on iOS only.');
    }
    if (!isSignedInAccount || !user?.id) {
      throw new Error('Create or sign in to a TadLock account before managing subscriptions.');
    }
    return user.id;
  }, [isSignedInAccount, isSupported, user?.id]);

  const refreshCustomerInfo = useCallback(async () => {
    if (!isSupported || !configuredRef.current || !isSignedInAccount) {
      clearState();
      return null;
    }

    const Purchases = getPurchases();
    const [nextCustomerInfo, nextOfferings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);

    setCustomerInfo(nextCustomerInfo);
    setOfferings(nextOfferings);
    return nextCustomerInfo;
  }, [clearState, isSignedInAccount, isSupported]);

  const configureForUser = useCallback(async (appUserId: string) => {
    const Purchases = getPurchases();

    if (!configuredRef.current) {
      Purchases.configure({
        apiKey: ENV.REVENUECAT_APPLE_API_KEY,
        appUserID: appUserId,
        entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      });
      configuredRef.current = true;
      currentAppUserIdRef.current = appUserId;
      await Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.ERROR);
      return;
    }

    if (currentAppUserIdRef.current !== appUserId) {
      const result = await Purchases.logIn(appUserId);
      currentAppUserIdRef.current = appUserId;
      setCustomerInfo(result.customerInfo);
    }
  }, []);

  useEffect(() => {
    if (!isSupported) {
      clearState();
      return undefined;
    }

    const Purchases = getPurchases();
    const listener = (nextCustomerInfo: CustomerInfo) => {
      setCustomerInfo(nextCustomerInfo);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [clearState, isSupported]);

  useEffect(() => {
    let cancelled = false;

    const syncRevenueCat = async () => {
      if (!isSupported) {
        clearState();
        setIsLoading(false);
        return;
      }

      if (!isSignedInAccount || !user?.id) {
        clearState();
        if (configuredRef.current) {
          try {
            const Purchases = getPurchases();
            await Purchases.logOut();
          } catch {
            // Ignore logout cleanup failures; the UI remains account-gated.
          }
          currentAppUserIdRef.current = null;
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        await configureForUser(user.id);
        const nextCustomerInfo = await refreshCustomerInfo();
        if (!cancelled && nextCustomerInfo) {
          setCustomerInfo(nextCustomerInfo);
        }
      } catch (error) {
        if (!cancelled) {
          clearState();
          console.warn('[RevenueCat] Sync failed:', formatRevenueCatError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    syncRevenueCat();
    return () => {
      cancelled = true;
    };
  }, [clearState, configureForUser, isSignedInAccount, isSupported, refreshCustomerInfo, user?.id]);

  const purchasePackage = useCallback(async (plan: RevenueCatPlan) => {
    const appUserId = ensureEligibleUser();
    await configureForUser(appUserId);
    const Purchases = getPurchases();
    const offering = currentOffering ?? getConfiguredOffering(await Purchases.getOfferings());
    const selectedPackage = findPackageForPlan(offering, plan);
    if (!selectedPackage) {
      throw new Error(`The ${plan} TadLock Pro package is not available in the current offering.`);
    }

    try {
      const result = await Purchases.purchasePackage(selectedPackage);
      setCustomerInfo(result.customerInfo);
      return result.customerInfo;
    } catch (error) {
      if (isPurchaseCancelledError(error)) {
        return null;
      }
      throw new Error(formatRevenueCatError(error, 'Could not complete your purchase.'));
    }
  }, [configureForUser, currentOffering, ensureEligibleUser]);

  const restorePurchases = useCallback(async () => {
    const appUserId = ensureEligibleUser();
    await configureForUser(appUserId);
    const Purchases = getPurchases();

    try {
      const nextCustomerInfo = await Purchases.restorePurchases();
      setCustomerInfo(nextCustomerInfo);
      return nextCustomerInfo;
    } catch (error) {
      throw new Error(formatRevenueCatError(error, 'Could not restore purchases.'));
    }
  }, [configureForUser, ensureEligibleUser]);

  const presentPaywall = useCallback(async () => {
    const appUserId = ensureEligibleUser();
    await configureForUser(appUserId);
    const Purchases = getPurchases();
    const RevenueCatUI = getRevenueCatUI();

    const selectedOffering = currentOffering ?? getConfiguredOffering(await Purchases.getOfferings());
    if (!selectedOffering) {
      throw new Error('No RevenueCat offering is available right now.');
    }

    const result = await RevenueCatUI.presentPaywall({
      offering: selectedOffering,
      displayCloseButton: true,
    });

    await refreshCustomerInfo().catch(() => null);
    if (result === PAYWALL_RESULTS.PURCHASED) return PAYWALL_RESULTS.PURCHASED;
    if (result === PAYWALL_RESULTS.RESTORED) return PAYWALL_RESULTS.RESTORED;
    if (result === PAYWALL_RESULTS.CANCELLED) return PAYWALL_RESULTS.CANCELLED;
    if (result === PAYWALL_RESULTS.ERROR) return PAYWALL_RESULTS.ERROR;
    return PAYWALL_RESULTS.NOT_PRESENTED;
  }, [configureForUser, currentOffering, ensureEligibleUser, refreshCustomerInfo]);

  const presentCustomerCenter = useCallback(async () => {
    const appUserId = ensureEligibleUser();
    await configureForUser(appUserId);
    const RevenueCatUI = getRevenueCatUI();

    try {
      await RevenueCatUI.presentCustomerCenter();
      await refreshCustomerInfo().catch(() => null);
    } catch (error) {
      throw new Error(formatRevenueCatError(error, 'Customer Center is not available right now.'));
    }
  }, [configureForUser, ensureEligibleUser, refreshCustomerInfo]);

  const value = useMemo<RevenueCatState>(() => ({
    isSupported,
    isConfigured: configuredRef.current && isSignedInAccount,
    isLoading,
    isPro,
    customerInfo,
    offerings,
    currentOffering,
    availablePackages,
    refreshCustomerInfo,
    purchasePackage,
    restorePurchases,
    presentPaywall,
    presentCustomerCenter,
  }), [
    availablePackages,
    currentOffering,
    customerInfo,
    isLoading,
    isSignedInAccount,
    isPro,
    isSupported,
    offerings,
    presentCustomerCenter,
    presentPaywall,
    purchasePackage,
    refreshCustomerInfo,
    restorePurchases,
  ]);

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}
