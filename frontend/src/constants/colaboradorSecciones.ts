import { Apple, Send, Truck, Factory, CalendarDays, AlertTriangle, ShoppingCart, BookOpen, PackageOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SeccionColab {
  key: string;
  label: string;
  icon: LucideIcon;
}

// Fuente unica de las secciones que puede tener un colaborador.
// Debe coincidir con SECCIONES_VALIDAS del backend y con las rutas de App.tsx.
export const COLAB_SECCIONES: SeccionColab[] = [
  { key: 'ingredientes', label: 'Ingredientes', icon: Apple },
  { key: 'envios-saboryaroma', label: 'Envios a SyA', icon: Send },
  { key: 'envios-coffit', label: 'Envios a Coffit', icon: Truck },
  { key: 'produccion', label: 'Produccion', icon: Factory },
  { key: 'plan-hoy', label: 'Plan de hoy', icon: CalendarDays },
  { key: 'perdidas', label: 'Registro perdidas', icon: AlertTriangle },
  { key: 'compras', label: 'Registro compras', icon: ShoppingCart },
  { key: 'carta', label: 'Carta', icon: BookOpen },
  { key: 'sabor-y-aroma', label: 'Sabor y Aroma', icon: PackageOpen },
];
