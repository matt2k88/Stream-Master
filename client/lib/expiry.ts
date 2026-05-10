export interface ExpiryStatus {
  isLifetime: boolean;
  isUnknown: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number;
  expiresAt: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const EXPIRY_WARNING_DAYS = 7;

export function computeExpiryStatus(
  expDate: string | null | undefined,
  isLifetime: boolean,
  now: Date = new Date(),
): ExpiryStatus {
  if (isLifetime) {
    return {
      isLifetime: true,
      isUnknown: false,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: Infinity,
      expiresAt: null,
    };
  }

  if (!expDate || expDate === "0" || !/^\d+$/.test(expDate)) {
    return {
      isLifetime: false,
      isUnknown: true,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: NaN,
      expiresAt: null,
    };
  }

  const seconds = parseInt(expDate, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {
      isLifetime: false,
      isUnknown: true,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: NaN,
      expiresAt: null,
    };
  }

  const expiresAt = new Date(seconds * 1000);
  const diffMs = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / MS_PER_DAY);

  return {
    isLifetime: false,
    isUnknown: false,
    isExpired: diffMs <= 0,
    isExpiringSoon: diffMs > 0 && daysRemaining <= EXPIRY_WARNING_DAYS,
    daysRemaining,
    expiresAt,
  };
}

export function formatExpiryNotice(status: ExpiryStatus): string {
  if (status.isExpired) return "Your subscription has expired";
  if (status.daysRemaining <= 0) return "Your subscription expires today";
  if (status.daysRemaining === 1) return "Your subscription expires tomorrow";
  return `Your subscription expires in ${status.daysRemaining} days`;
}
