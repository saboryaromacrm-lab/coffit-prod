export interface EnvioCoffit {
  id: number;
  fecha: string;
  ingrediente_id: number | null;
  ingrediente_nombre: string;
  cantidad_enviada: number;            // SIEMPRE en unidad base (g, ml, etc)
  cantidad_envases: number | null;     // null = se cargo en unidad base; >0 = cargo por envase
  contenido_envase: number | null;     // snapshot del envase al momento del envio
  unidad_base: string | null;          // 'g', 'ml', etc - solo para mostrar
  cantidad_devuelta: number;
  cantidad_util: number;
  observacion: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EnvioCoffitInput {
  fecha: string;
  ingrediente_id?: number | null;
  ingrediente_nombre: string;
  cantidad_enviada: number;
  // Opcionales: si se carga por envase
  cantidad_envases?: number | null;
  contenido_envase?: number | null;
  unidad_base?: string | null;
  observacion?: string | null;
}

export interface EnvioCoffitCatalogo {
  id: number;
  nombre: string;
  unidad: string;
  contenido_envase: number;
  costo_unitario: number;
}

export interface ReporteCoffitRegistro {
  id: number;
  fecha: string;
  ingrediente_id: number | null;
  ingrediente_nombre: string;
  cantidad_enviada: number;
  cantidad_devuelta: number;
  cantidad_util: number;
  observacion: string | null;
  costo_unitario: number;
  monto_enviado: number;
  monto_devuelto: number;
  monto_util: number;
}

export interface ReporteCoffitPorIngrediente {
  ingrediente_nombre: string;
  n_envios: number;
  total_enviados: number;
  total_devueltos: number;
  total_utiles: number;
  costo_unitario: number;
  monto_enviado: number;
  monto_devuelto: number;
  monto_util: number;
}

export interface ReporteCoffitPorDia {
  fecha: string;
  total_enviados: number;
  total_devueltos: number;
  monto_enviado: number;
  monto_devuelto: number;
}

export interface ReporteCoffitTotales {
  total_envios: number;
  total_enviados: number;
  total_devueltos: number;
  total_utiles: number;
  monto_enviado: number;
  monto_devuelto: number;
  monto_util: number;
  ingredientes_distintos: number;
}

export interface ReporteCoffitData {
  registros: ReporteCoffitRegistro[];
  porIngrediente: ReporteCoffitPorIngrediente[];
  porDia: ReporteCoffitPorDia[];
  totales: ReporteCoffitTotales;
}

// ----- Resultados combinados -----

export interface ResultadosLado {
  monto_enviado: number;
  monto_util: number;
  cant_enviada: number;
}

export interface ResultadosEnviadoSya extends ResultadosLado {
  monto_vencido: number;
  cant_vencida: number;
}

export interface ResultadosRecibidoSya extends ResultadosLado {
  monto_devuelto: number;
  cant_devuelta: number;
}

export interface ResultadosPorDia {
  fecha: string;
  enviado_sya: number;
  recibido_coffit: number;
  balance: number;
}

export interface ResultadosData {
  enviado_a_sya: ResultadosEnviadoSya;
  recibido_de_sya: ResultadosRecibidoSya;
  balance: number;
  a_favor: boolean;
  porDia: ResultadosPorDia[];
}
