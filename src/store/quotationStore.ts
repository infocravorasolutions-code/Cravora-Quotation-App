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
}

export interface QuotationState {
  clientInfo: ClientInfo;
  modules: Module[];
  buffer: number;
  tax: number;
  quotationId: string;
  setClientInfo: (info: ClientInfo) => void;
  addModule: (module: Module) => void;
  updateModule: (id: string, module: Module) => void;
  deleteModule: (id: string) => void;
  setBuffer: (buffer: number) => void;
  setTax: (tax: number) => void;
  getSubtotal: () => number;
  getBufferAmount: () => number;
  getTaxAmount: () => number;
  getGrandTotal: () => number;
  generateQuotationId: () => void;
  reset: () => void;
}

const initialClientInfo: ClientInfo = {
  clientName: '',
  clientEmail: '',
  projectName: '',
  projectDescription: '',
  currency: 'INR',
  pricingType: 'Hourly',
};

export const useQuotationStore = create<QuotationState>((set, get) => ({
  clientInfo: initialClientInfo,
  modules: [],
  buffer: 10,
  tax: 18,
  quotationId: '',

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

  setBuffer: (buffer) => set({ buffer }),

  setTax: (tax) => set({ tax }),

  getSubtotal: () => {
    const state = get();
    return state.modules.reduce((sum, module) => sum + module.total, 0);
  },

  getBufferAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    return (subtotal * state.buffer) / 100;
  },

  getTaxAmount: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const bufferAmount = state.getBufferAmount();
    return ((subtotal + bufferAmount) * state.tax) / 100;
  },

  getGrandTotal: () => {
    const state = get();
    const subtotal = state.getSubtotal();
    const bufferAmount = state.getBufferAmount();
    const taxAmount = state.getTaxAmount();
    return subtotal + bufferAmount + taxAmount;
  },

  generateQuotationId: () => {
    const year = new Date().getFullYear();
    const existing = JSON.parse(localStorage.getItem('quotations') || '[]');
    const count = existing.length + 1;
    const id = `QTN-${year}-${String(count).padStart(3, '0')}`;
    set({ quotationId: id });
  },

  reset: () =>
    set({
      clientInfo: initialClientInfo,
      modules: [],
      buffer: 10,
      tax: 18,
      quotationId: '',
    }),
}));
