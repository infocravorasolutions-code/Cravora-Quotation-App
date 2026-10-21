import { create } from 'zustand';
import { apiUrl, authHeaders } from '../utils/api';

export interface Module {
  id: string;
  name: string;
  description: string;
  hours: number;
  rate: number;
  total: number;
}

export interface ClientInfo {
  clientName: string;
  clientEmail: string;
  clientMobile?: string;
  projectName: string;
  projectDescription: string;
  currency: 'INR' | 'USD';
  pricingType: 'Hourly' | 'Fixed';
  gstNumber?: string;
  clientGstNumber?: string;
  clientAddress?: string;
  companyAddress?: string;
  companyPan?: string;
  clientPan?: string;
  placeOfSupply?: string;
  countryOfSupply?: string;
  shippingAddress?: string;
}

export interface GSTDetails {
  gstType: 'intra' | 'inter'; // intra-state (CGST+SGST) or inter-state (IGST)
  gstRate: number; // 0, 5, 12, 18, 28
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
}

export interface QuotationState {
  clientInfo: ClientInfo;
  modules: Module[];
  tax: number;
  gstDetails: GSTDetails;
  quotationId: string;
  isDraft: boolean;
  lastSaved: string | null;
  setClientInfo: (info: ClientInfo) => void;
  addModule: (module: Module) => void;
  updateModule: (id: string, module: Module) => void;
  deleteModule: (id: string) => void;
  setTax: (tax: number) => void;
  discountRate: number;
  setDiscountRate: (rate: number) => void;
  termsAndConditions: string[];
  setTermsAndConditions: (terms: string[]) => void;
  documentType: 'Quotation' | 'Billing';
  setDocumentType: (type: 'Quotation' | 'Billing') => void;
  clientId: string;
  status: string;
  notes: string;
  validUntil: string;
  publicToken: string;
  issuedAt: string | null;
  setClientId: (clientId: string) => void;
  setNotes: (notes: string) => void;
  setValidUntil: (validUntil: string) => void;
  setLifecycle: (fields: Partial<Pick<QuotationState, 'status' | 'publicToken' | 'issuedAt' | 'isDraft'>>) => void;
  setGstDetails: (gst: GSTDetails) => void;
  updateGstAmounts: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getGstAmount: () => number;
  getGrandTotal: () => number;
  generateQuotationId: (force?: boolean) => Promise<void>;
  saveDraft: () => Promise<void>;
  loadDraft: (draftId: string) => Promise<void>;
  markAsDraft: () => void;
  markAsFinal: () => void;
  reset: () => void;
}

const initialClientInfo: ClientInfo = {
  clientName: '',
  clientEmail: '',
  projectName: '',
  projectDescription: '',
  currency: 'INR',
  pricingType: 'Hourly',
  gstNumber: '',
  clientGstNumber: '',
  clientAddress: '',
  companyAddress: '',
  companyPan: '',
  clientPan: '',
  placeOfSupply: '',
  countryOfSupply: '',
  shippingAddress: '',
};

const LOCKED_STATUSES = ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'];

const initialGstDetails: GSTDetails = {
  gstType: 'intra',
  gstRate: 18,
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 18,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  totalGstAmount: 0,
};

export const useQuotationStore = create<QuotationState>((set, get) => ({
  clientInfo: initialClientInfo,
  modules: [],
  tax: 18,
  discountRate: 0,
  termsAndConditions: [
    'A 30% deposit is required before the project begins.',
    'The remaining 70% is payable upon the completion of each project milestone or the final deadline.',
    'Payments made for completed modules are non-refundable if the contract is terminated.',
    `Any delays in providing designs or approvals from the client's side will result in an extension of the overall project timelines.`,
    'The final delivery includes tested code with integrated APIs for each module.',
    'All project details, including source code and designs, will be kept strictly confidential. '

  ],
  documentType: 'Quotation',
  gstDetails: initialGstDetails,
  quotationId: '',
  isDraft: true,
  lastSaved: null,
  clientId: '',
  status: 'draft',
  notes: '',
  validUntil: '',
  publicToken: '',
  issuedAt: null,

  setClientInfo: (info) => set({ clientInfo: info }),

  addModule: (module) =>
    set((state) => ({ modules: [...state.modules, module] })),

  updateModule: (id, module) =>
    set((state) => ({
      modules: state.modules.map((m) => (m.id === id ? module : m)),
    })),

  deleteModule: (id) =>
    set((state) => ({
      modules: state.modules.filter((m) => m.id !== id),
    })),

  setTax: (tax) => set({ tax }),

  setDiscountRate: (rate) => set({ discountRate: rate }),

  setTermsAndConditions: (terms) => set({ termsAndConditions: terms }),

  setDocumentType: (type) => set({ documentType: type }),
  setClientId: (clientId) => set({ clientId }),
  setNotes: (notes) => set({ notes }),
  setValidUntil: (validUntil) => set({ validUntil }),
  setLifecycle: (fields) => set(fields),

  setGstDetails: (gst) => set({ gstDetails: gst }),

  updateGstAmounts: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const discount = state.getDiscountAmount();
    const taxableAmount = subtotal - discount;

    const gst = state.gstDetails;

    if (gst.gstType === 'intra') {
      // Intra-state: CGST + SGST
      const cgstAmount = (taxableAmount * gst.cgstRate) / 100;
      const sgstAmount = (taxableAmount * gst.sgstRate) / 100;
      const totalGst = cgstAmount + sgstAmount;

      set({
        gstDetails: {
          ...gst,
          cgstAmount,
          sgstAmount,
          totalGstAmount: totalGst,
        }
      });
    } else {
      // Inter-state: IGST
      const igstAmount = (taxableAmount * gst.igstRate) / 100;

      set({
        gstDetails: {
          ...gst,
          igstAmount,
          totalGstAmount: igstAmount,
        }
      });
    }
  },

  getSubtotal: () => {
    const state = get();
    return state.modules.reduce((sum, module) => sum + module.total, 0);
  },

  getDiscountAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    return (subtotal * state.discountRate) / 100;
  },

  getTaxAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const discount = state.getDiscountAmount();
    return ((subtotal - discount) * state.tax) / 100;
  },

  getGstAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const discount = state.getDiscountAmount();
    const taxableAmount = subtotal - discount;

    const gst = state.gstDetails;

    if (gst.gstType === 'intra') {
      // Intra-state: CGST + SGST
      const cgstAmount = (taxableAmount * gst.cgstRate) / 100;
      const sgstAmount = (taxableAmount * gst.sgstRate) / 100;
      const totalGst = cgstAmount + sgstAmount;

      return totalGst;
    } else {
      // Inter-state: IGST
      const igstAmount = (taxableAmount * gst.igstRate) / 100;
      return igstAmount;
    }
  },

  getGrandTotal: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const discount = state.getDiscountAmount();
    const gstAmount = state.getGstAmount();
    return subtotal - discount + gstAmount;
  },

  generateQuotationId: async (force = false) => {
    if (!force && get().quotationId) return;
    const state = get();
    try {
      const res = await fetch(apiUrl('/api/quotations/next-number'), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documentType: state.documentType }),
      });
      if (!res.ok) throw new Error('Numbering failed');
      const data = await res.json();
      set({ quotationId: data.quotationId });
    } catch (error) {
      console.error('Failed to generate ID. Is backend running?', error);
      const year = new Date().getFullYear();
      const prefixFallback = state.documentType === 'Billing' ? 'BILL' : 'QTN';
      const id = `${prefixFallback}-${year}-${Math.floor(Math.random() * 1000)}`;
      set({ quotationId: id });
    }
  },

  saveDraft: async () => {
    const state = get();
    const draftId = state.quotationId || `DRAFT-${Date.now()}`;

    const draft = {
      quotationId: draftId,
      clientInfo: state.clientInfo,
      clientId: state.clientId || undefined,
      modules: state.modules,
      tax: state.tax,
      discountRate: state.discountRate,
      termsAndConditions: state.termsAndConditions,
      documentType: state.documentType,
      gstDetails: state.gstDetails,
      notes: state.notes,
      validUntil: state.validUntil || undefined,
      isDraft: true,
      lastSaved: new Date().toISOString(),
      subtotal: state.getSubtotal(),
      discountAmount: state.getDiscountAmount(),
      taxAmount: state.getTaxAmount(),
      grandTotal: state.getGrandTotal(),
    };

    const headers = authHeaders({ 'Content-Type': 'application/json' });
    const existingRes = await fetch(apiUrl(`/api/quotations/${draftId}`), { headers: authHeaders() });
    if (existingRes.ok) {
      const updated = await fetch(apiUrl(`/api/quotations/${draftId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(draft),
      });
      if (!updated.ok) {
        const data = await updated.json().catch(() => ({}));
        throw new Error(data.message || 'Could not save the draft');
      }
    } else if (existingRes.status === 404) {
      const created = await fetch(apiUrl('/api/quotations'), {
        method: 'POST',
        headers,
        body: JSON.stringify(draft),
      });
      if (!created.ok) {
        const data = await created.json().catch(() => ({}));
        throw new Error(data.message || 'Could not save the draft');
      }
    } else {
      const data = await existingRes.json().catch(() => ({}));
      throw new Error(data.message || 'Could not save the draft');
    }
    set({ lastSaved: new Date().toISOString() });
  },

  loadDraft: async (draftId: string) => {
    const state = get();
    try {
      const res = await fetch(apiUrl(`/api/quotations/${draftId}`), { headers: authHeaders() });
      if (res.ok) {
        const draft = await res.json();
        set({
          clientInfo: draft.clientInfo || state.clientInfo,
          modules: draft.modules || [],
          tax: draft.tax,
          discountRate: draft.discountRate || 0,
          termsAndConditions: draft.termsAndConditions || [
            'Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments.',
            'Please quote invoice number when remitting funds.'
          ],
          documentType: draft.documentType || 'Quotation',
          gstDetails: draft.gstDetails || state.gstDetails,
          quotationId: draft.quotationId,
          isDraft: draft.isDraft !== undefined ? draft.isDraft : true,
          lastSaved: draft.lastSaved,
          clientId: draft.clientId || '',
          status: draft.status || (draft.isDraft === false ? 'final' : 'draft'),
          notes: draft.notes || '',
          validUntil: draft.validUntil ? String(draft.validUntil).slice(0, 10) : '',
          publicToken: draft.publicToken || '',
          issuedAt: draft.issuedAt || null,
        });
      }
    } catch (error) {
      console.error('Failed to load draft', error);
    }
  },

  markAsDraft: () => set({ isDraft: true }),
  markAsFinal: () => set((state) => ({
    isDraft: false,
    status: LOCKED_STATUSES.includes(state.status) ? state.status : 'final',
  })),

  reset: () =>
    set({
      clientInfo: initialClientInfo,
      modules: [],
      tax: 18,
      discountRate: 0,
      termsAndConditions: [
        'Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments.',
        'Please quote invoice number when remitting funds.'
      ],
      documentType: 'Quotation',
      gstDetails: initialGstDetails,
      quotationId: '',
      isDraft: true,
      lastSaved: null,
      clientId: '',
      status: 'draft',
      notes: '',
      validUntil: '',
      publicToken: '',
      issuedAt: null,
    }),
}));
