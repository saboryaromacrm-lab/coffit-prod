export interface PlanSemanalItem {
  id: number;
  dia_semana: number; // 0=Domingo, 1=Lunes, ..., 6=Sabado (estandar JS)
  item_tipo: 'producto' | 'subreceta';
  item_id: number | null;
  item_nombre: string;
  cantidad: number;
  observacion: string | null;
  orden: number;
  fecha: string | null; // null = plantilla recurrente, 'YYYY-MM-DD' = puntual
  es_plantilla: boolean;
}

export interface PlanSemanalPlantilla {
  modo: 'plantilla';
  porDia: PlanSemanalItem[][]; // index = dia_semana 0..6
}

export interface PlanSemanalSemana {
  modo: 'semana';
  lunes: string;
  domingo: string;
  porDia: PlanSemanalItem[][];
}

export type PlanSemanalData = PlanSemanalPlantilla | PlanSemanalSemana;

export interface PlanHoyData {
  fecha: string;
  dia_semana: number;
  items: PlanSemanalItem[];
}

export interface PlanSemanalInput {
  dia_semana: number;
  item_tipo: 'producto' | 'subreceta';
  item_id?: number | null;
  item_nombre: string;
  cantidad: number;
  observacion?: string | null;
  fecha?: string | null;
}
