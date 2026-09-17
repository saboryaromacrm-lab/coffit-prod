import { create } from 'zustand';

interface IngredientesUIState {
  filtros: {
    buscar: string;
    proveedor: string;
    orden: string;
    antiguedad: string;
    fechaDesde: string;
    fechaHasta: string;
    precioViejo: string;
  };
  modalOpen: boolean;
  editingId: number | null;
  setFiltro: (key: string, value: string) => void;
  openModal: (id?: number) => void;
  closeModal: () => void;
  resetFiltros: () => void;
}

const defaultFiltros = {
  buscar: '',
  proveedor: '',
  orden: 'nombre',
  antiguedad: '',
  fechaDesde: '',
  fechaHasta: '',
  precioViejo: '',
};

export const useIngredientesStore = create<IngredientesUIState>((set) => ({
  filtros: { ...defaultFiltros },
  modalOpen: false,
  editingId: null,
  setFiltro: (key, value) =>
    set((s) => ({ filtros: { ...s.filtros, [key]: value } })),
  openModal: (id) => set({ modalOpen: true, editingId: id ?? null }),
  closeModal: () => set({ modalOpen: false, editingId: null }),
  resetFiltros: () => set({ filtros: { ...defaultFiltros } }),
}));
