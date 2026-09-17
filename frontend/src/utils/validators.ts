export function validateIngrediente(data: {
  nombre?: string;
  contenido_envase?: number;
  desperdicio?: number;
  precio1?: number;
}): string[] {
  const errors: string[] = [];
  if (!data.nombre?.trim()) errors.push('Nombre es requerido');
  if (!data.contenido_envase || data.contenido_envase <= 0)
    errors.push('Contenido envase debe ser mayor a 0');
  if (data.desperdicio !== undefined && (data.desperdicio < 0 || data.desperdicio >= 100))
    errors.push('Desperdicio debe estar entre 0 y 99%');
  if (data.precio1 !== undefined && data.precio1 < 0)
    errors.push('Precio debe ser mayor o igual a 0');
  return errors;
}

export function validateProducto(data: {
  nombre?: string;
  porciones?: number;
  ingredientes?: unknown[];
}): string[] {
  const errors: string[] = [];
  if (!data.nombre?.trim()) errors.push('Nombre es requerido');
  if (!data.porciones || data.porciones < 1) errors.push('Porciones debe ser al menos 1');
  if (!data.ingredientes || data.ingredientes.length === 0)
    errors.push('Se requiere al menos 1 ingrediente o subreceta');
  return errors;
}

export function validateSubreceta(data: {
  nombre?: string;
  rendimiento_gramos?: number;
  ingredientes?: unknown[];
}): string[] {
  const errors: string[] = [];
  if (!data.nombre?.trim()) errors.push('Nombre es requerido');
  if (!data.rendimiento_gramos || data.rendimiento_gramos <= 0)
    errors.push('Rendimiento debe ser mayor a 0');
  if (!data.ingredientes || data.ingredientes.length === 0)
    errors.push('Se requiere al menos 1 ingrediente');
  return errors;
}
