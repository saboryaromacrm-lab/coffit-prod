-- ============================================================================
-- PROMO "COMPRA + REGALO" (combo fijo con productos de regalo)
-- Cada producto de una promo pasa a tener un ROL:
--   'pago'   = el cliente lo paga a precio de lista (default, comportamiento actual)
--   'regalo' = va con descuento_pct de descuento (100 = gratis, 50 = mitad, etc)
-- El costo del regalo SIEMPRE cuenta en el costo del combo (margen real).
-- ofertas.valor en tipo 'compra_regalo' = precio especial opcional del combo
-- (0 = precio automatico: suma de pagados + regalos con su descuento).
-- Ejecutar una sola vez en phpMyAdmin (con la base seleccionada primero).
-- ============================================================================

ALTER TABLE oferta_productos
  ADD COLUMN rol VARCHAR(10) NOT NULL DEFAULT 'pago' AFTER cantidad,
  ADD COLUMN descuento_pct DECIMAL(5,2) NOT NULL DEFAULT 100 AFTER rol;
