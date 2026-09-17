export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  total?: number;
  categorias?: string[];
}

export interface Unidad {
  id: number;
  nombre: string;
  abreviatura: string;
  activo: boolean;
}

export interface Proveedor {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  cantidad_ingredientes?: number;
  created_at?: string;
}

export interface CategoriaIngrediente {
  id: number;
  nombre: string;
  color: string;
  activo: boolean;
}

// Jerarquia de 2 niveles: parent_id null = categoria raiz;
// parent_id != null = subcategoria de esa raiz.
export interface CategoriaProducto {
  id: number;
  nombre: string;
  parent_id: number | null;
  parent_nombre?: string | null;
  icono: string;
  color: string;
  orden: number;
  activo: boolean;
}

export interface Canal {
  id: number;
  codigo: string;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
  activo: boolean;
}

export interface DashboardData {
  ingredientes: number;
  subrecetas: number;
  productos: number;
  categorias: number;
  config: Record<string, string>;
  unidades: Unidad[];
  categorias_ingredientes: { nombre: string }[];
  productos_bajo_margen: { id: number; nombre: string; mc_min: number }[];
  ingredientes_sin_proveedor: { id: number; nombre: string }[];
}
