export interface PaymentProfile {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  qrDataUrl: string;
}

const STORAGE_KEY = 'cravora.paymentProfile';

export const defaultPaymentProfile: PaymentProfile = {
  bankName: 'HDFC Bank',
  accountName: 'Cravora Solutions',
  accountNumber: '12345678901234',
  ifsc: 'HDFC0001234',
  upiId: 'payments@cravora',
  qrDataUrl: '',
};

export function loadPaymentProfile(): PaymentProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPaymentProfile };
    const parsed = JSON.parse(raw) as Partial<PaymentProfile>;
    return {
      bankName: String(parsed.bankName ?? defaultPaymentProfile.bankName),
      accountName: String(parsed.accountName ?? defaultPaymentProfile.accountName),
      accountNumber: String(parsed.accountNumber ?? defaultPaymentProfile.accountNumber),
      ifsc: String(parsed.ifsc ?? defaultPaymentProfile.ifsc),
      upiId: String(parsed.upiId ?? defaultPaymentProfile.upiId),
      qrDataUrl: typeof parsed.qrDataUrl === 'string' ? parsed.qrDataUrl : '',
    };
  } catch {
    return { ...defaultPaymentProfile };
  }
}

export function savePaymentProfile(profile: PaymentProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
