-- ============================================================================
-- UNIFICACION PRODUCTOS <-> CARTA
-- Un item de carta mapeado HEREDA del producto: nombre, categoria y precio.
-- `precio_manual` = 1 permite forzar un precio de menu distinto al del producto
-- (override opcional). Por defecto 0 = usa el precio del producto.
-- Ejecutar una sola vez en phpMyAdmin.
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN precio_manual TINYINT(1) DEFAULT 0 AFTER precio_venta;
