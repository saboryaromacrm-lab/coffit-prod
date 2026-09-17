-- ============================================================================
-- MAPEO CARTA <-> PROMOS (ofertas)
-- Un item de carta puede ser un PRODUCTO suelto (producto_id) o una PROMO/combo
-- (oferta_id). Son EXCLUYENTES: al mapear a uno se limpia el otro.
-- Para una promo: costo = suma de costos de sus productos x cantidad,
-- precio = precio especial del combo (tipo precio_especial) o suma de precios.
-- Ejecutar una sola vez en phpMyAdmin.
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN oferta_id INT NULL AFTER producto_id,
  ADD INDEX idx_carta_oferta (oferta_id);
