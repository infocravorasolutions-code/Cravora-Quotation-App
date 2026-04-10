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
  setGstDetails: (gst: GSTDetails) => void;
  updateGstAmounts: () => void;
  getSubtotal: () => number;
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
<<<<<<< Updated upstream
=======
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
>>>>>>> Stashed changes
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

  setGstDetails: (gst) => set({ gstDetails: gst }),

  updateGstAmounts: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const taxableAmount = subtotal;
    
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

  getTaxAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    return (subtotal * state.tax) / 100;
  },

  getGstAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const taxableAmount = subtotal;
    
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
    const gstAmount = state.getGstAmount();
    return subtotal + gstAmount;
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
      isDraft: true,
      lastSaved: new Date().toISOString(),
      subtotal: state.getSubtotal(),
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
      gstDetails: initialGstDetails,
      quotationId: '',
      isDraft: true,
      lastSaved: null,
    }),
}));
