import { create } from 'zustand';
import { Company, User } from '../types';

interface UIState {
  // Sidebar State
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  
  // Active User / Tenant context state
  currentUser: User | null;
  activeCompany: Company | null;
  availableCompanies: Company[];
  setCurrentUser: (user: User | null) => void;
  setActiveCompany: (company: Company | null) => void;
  setAvailableCompanies: (companies: Company[]) => void;
  
  // Reticle Hover Coordinates (AI Integration Model)
  activeReticleValue: string | null;
  activeReticleConfidence: number | null;
  setReticle: (value: string | null, confidence: number | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  currentUser: null,
  activeCompany: null,
  availableCompanies: [],
  setCurrentUser: (user) => set({ currentUser: user }),
  setActiveCompany: (company) => set({ activeCompany: company }),
  setAvailableCompanies: (companies) => set({ availableCompanies: companies }),
  
  activeReticleValue: null,
  activeReticleConfidence: null,
  setReticle: (value, confidence) => set({ activeReticleValue: value, activeReticleConfidence: confidence }),
}));
