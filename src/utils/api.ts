const rawBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
/** Base URL for API calls. Normalized without trailing slash or duplicate /api. */
export const API_BASE = (rawBase || (import.meta.env.DEV ? 'http://localhost:5001' : ''))
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

/**
 * Builds a safe, canonical URL for any API endpoint.
 * Ensures the path starts with /api and never duplicates /api even if present in VITE_API_BASE.
 */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiPath = cleanPath.startsWith('/api/') || cleanPath === '/api'
    ? cleanPath
    : `/api${cleanPath}`;
  return API_BASE ? `${API_BASE}${apiPath}` : apiPath;
}


export interface ApiRecord {
  message?: string;
  items?: ApiRecord[];
  quotationId?: string;
  status?: string;
  publicToken?: string;
  issuedAt?: string;
  invoiceNumber?: string;
  clientId?: string;
  payment?: { _id?: string };
  receiptNumber?: string;
  grandTotal?: number;
  balanceDue?: number;
  amount?: number;
  amountPaid?: number;
  currency?: 'INR' | 'USD';
  clientSnapshot?: {
    clientName?: string;
    clientEmail?: string;
    currency?: 'INR' | 'USD';
  };
  _id?: string;
  companyName?: string;
  email?: string;
  gstin?: string;
  billingAddress?: string;
  shippingAddress?: string;
  quotations?: Record<string, number>;
  invoices?: { total: number; unpaid: number; overdue: number; invoiced: number };
  paid?: number;
  outstanding?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  timestamp?: string;
  invoiceId?: string;
  paymentMethod?: string;
  transactionReference?: string;
  paymentDate?: string;
  token?: string;
  needsSetup?: boolean;
  configured?: boolean;
  host?: string;
  port?: number;
  user?: string;
  from?: string;
  passwordSet?: boolean;
  role?: string;
  duplicate?: boolean;
}

export function authHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const token = localStorage.getItem('cravora.token');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export async function apiJson(path: string, options: RequestInit = {}): Promise<ApiRecord> {
  const headers = authHeaders(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const url = apiUrl(path);
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as ApiRecord;
  if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/setup')) {
    localStorage.removeItem('cravora.token');
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/public')) {
      window.location.assign('/login');
    }
  }
  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

export function asItems<T>(data: ApiRecord): T[] {
  return (data.items || []) as T[];
}

export function asBody<T>(data: ApiRecord): T {
  return data as T;
}

export function publicQuotationUrl(token: string) {
  return `${window.location.origin}/public/quotation/${token}`;
}

export function newRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
