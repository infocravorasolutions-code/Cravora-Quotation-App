import { create } from 'zustand';

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
  setGstDetails: (gst: GSTDetails) => void;
  updateGstAmounts: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getGstAmount: () => number;
  getGrandTotal: () => number;
  generateQuotationId: () => void;
  saveDraft: () => void;
  loadDraft: (draftId: string) => void;
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
};

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
    'Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments.',
    'Please quote invoice number when remitting funds.'
  ],
  documentType: 'Quotation',
  gstDetails: initialGstDetails,
  quotationId: '',
  isDraft: true,
  lastSaved: null,

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

  generateQuotationId: () => {
    const year = new Date().getFullYear();
    const existing = JSON.parse(localStorage.getItem('quotations') || '[]');
    const count = existing.length + 1;
    const id = `QTN-${year}-${String(count).padStart(3, '0')}`;
    set({ quotationId: id });
  },

  saveDraft: () => {
    const state = get();
    const draftId = state.quotationId || `DRAFT-${Date.now()}`;

    const draft = {
      id: draftId,
      clientInfo: state.clientInfo,
      modules: state.modules,
      tax: state.tax,
      discountRate: state.discountRate,
      termsAndConditions: state.termsAndConditions,
      documentType: state.documentType,
      isDraft: true,
      lastSaved: new Date().toISOString(),
      subtotal: state.getSubtotal(),
      discountAmount: state.getDiscountAmount(),
      taxAmount: state.getTaxAmount(),
      grandTotal: state.getGrandTotal(),
    };

    const existingDrafts = JSON.parse(localStorage.getItem('drafts') || '[]');
    const updatedDrafts = existingDrafts.filter((d: any) => d.id !== draftId);
    updatedDrafts.push(draft);

    localStorage.setItem('drafts', JSON.stringify(updatedDrafts));
    set({ lastSaved: new Date().toISOString() });
  },

  loadDraft: (draftId: string) => {
    const drafts = JSON.parse(localStorage.getItem('drafts') || '[]');
    const draft = drafts.find((d: any) => d.id === draftId);

    if (draft) {
      set({
        clientInfo: draft.clientInfo,
        modules: draft.modules,
        tax: draft.tax,
        discountRate: draft.discountRate || 0,
        termsAndConditions: draft.termsAndConditions || [
          'Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments.',
          'Please quote invoice number when remitting funds.'
        ],
        documentType: draft.documentType || 'Quotation',
        quotationId: draft.id,
        isDraft: true,
        lastSaved: draft.lastSaved,
      });
    }
  },

  markAsDraft: () => set({ isDraft: true }),
  markAsFinal: () => set({ isDraft: false }),

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
    }),
}));
