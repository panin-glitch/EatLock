import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesError,
} from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { ENV } from '../config/env';

export type RevenueCatPlan = 'monthly' | 'yearly';

export function isRevenueCatEnabledForPlatform(platform: string): boolean {
  return platform === 'ios' && ENV.REVENUECAT_APPLE_API_KEY.trim().length > 0;
}

export function hasTadLockProEntitlement(customerInfo: CustomerInfo | null | undefined): boolean {
  if (!customerInfo) return false;
  return Boolean(customerInfo.entitlements.active[ENV.REVENUECAT_ENTITLEMENT_ID]);
}

export function getConfiguredOffering(
  offerings: PurchasesOfferings | null | undefined,
): PurchasesOffering | null {
  if (!offerings) return null;
  return offerings.all[ENV.REVENUECAT_OFFERING_ID] ?? offerings.current ?? null;
}

export function findPackageForPlan(
  offering: PurchasesOffering | null | undefined,
  plan: RevenueCatPlan,
): PurchasesPackage | null {
  if (!offering) return null;

  const productId = plan === 'monthly'
    ? ENV.REVENUECAT_MONTHLY_PRODUCT_ID
    : ENV.REVENUECAT_YEARLY_PRODUCT_ID;

  return offering.availablePackages.find((pkg) => pkg.product.identifier === productId) ?? null;
}

export function formatRevenueCatError(
  error: unknown,
  fallback = 'Something went wrong with subscriptions.',
): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim().length > 0 ? error : fallback;
  }

  const message = String((error as { message?: string }).message ?? '').trim();
  if (message.length > 0) {
    return message;
  }

  const purchasesError = error as PurchasesError;
  const readableCode = String(purchasesError.userInfo?.readableErrorCode ?? '').trim();
  if (readableCode.length > 0) {
    return readableCode;
  }

  return fallback;
}

export function isPurchaseCancelledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const purchasesError = error as PurchasesError;
  return purchasesError.userCancelled === true
    || purchasesError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

