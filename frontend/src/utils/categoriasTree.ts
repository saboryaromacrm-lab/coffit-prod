import type { CategoriaProducto } from '../types';

// ============================================================================
// Jerarquia de categorias de producto (2 niveles: raiz -> subcategoria).
// El backend devuelve la lista PLANA ya ordenada como arbol (cada raiz seguida
// de sus hijas). Estos helpers derivan lo que necesitan las pantallas sin
// pedir nada mas ni recorrer la lista de mas.
// ============================================================================

export const esRaiz = (c: CategoriaProducto) => c.parent_id == null;

/** Solo las categorias raiz, en orden. */
export function soloRaices(cats: CategoriaProducto[]): CategoriaProducto[] {
  return cats.filter(esRaiz);
}

/** Subcategorias de una raiz, en orden. */
export function hijasDe(cats: CategoriaProducto[], parentId: number | null | undefined): CategoriaProducto[] {
  if (parentId == null) return [];
  return cats.filter((c) => c.parent_id === parentId);
}

/** Cuantas subcategorias tiene cada raiz (para saber si mostrar el 2do select). */
export function tieneHijas(cats: CategoriaProducto[], parentId: number | null | undefined): boolean {
  return parentId != null && cats.some((c) => c.parent_id === parentId);
}

/** Dado el id guardado en el producto, devuelve el id de su RAIZ. */
export function raizDe(cats: CategoriaProducto[], categoriaId: number | null | undefined): number | null {
  if (categoriaId == null) return null;
  const c = cats.find((x) => x.id === categoriaId);
  if (!c) return null;
  return c.parent_id ?? c.id;
}

/**
 * Opciones para un <select> unico con la jerarquia indentada.
 * Elegir una raiz filtra tambien sus subcategorias (lo resuelve el backend).
 */
export function opcionesJerarquia(cats: CategoriaProducto[]): { id: number; label: string; esHija: boolean }[] {
  const out: { id: number; label: string; esHija: boolean }[] = [];
  for (const c of cats) {
    out.push({
      id: c.id,
      label: c.parent_id == null ? `${c.icono || '📁'} ${c.nombre}` : `   ↳ ${c.nombre}`,
      esHija: c.parent_id != null,
    });
  }
  return out;
}

/** "Dulces › Fit" o "Dulces" — para mostrar la ruta completa. */
export function rutaCategoria(categoria?: string | null, subcategoria?: string | null): string {
  if (!categoria) return subcategoria || '';
  return subcategoria ? `${categoria} › ${subcategoria}` : categoria;
}
