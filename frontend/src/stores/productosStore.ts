import { create } from 'zustand';

interface ProductosUIState {
  tabActivo: 'publicados' | 'borradores';
  buscar: string;
  categoriaId: string;
  modalOpen: boolean;
  editingId: number | null;
  setTab: (tab: 'publicados' | 'borradores') => void;
  setBuscar: (buscar: string) => void;
  setCategoriaId: (id: string) => void;
  openModal: (id?: number) => void;
  closeModal: () => void;
}

export const useProductosStore = create<ProductosUIState>((set) => ({
  tabActivo: 'publicados',
  buscar: '',
  categoriaId: '',
  modalOpen: false,
  editingId: null,
  setTab: (tab) => set({ tabActivo: tab }),
  setBuscar: (buscar) => set({ buscar }),
  setCategoriaId: (id) => set({ categoriaId: id }),
  openModal: (id) => set({ modalOpen: true, editingId: id ?? null }),
  closeModal: () => set({ modalOpen: false, editingId: null }),
}));
