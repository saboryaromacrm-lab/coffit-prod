-- ============================================================================
-- CATEGORIA DE CARTA en promos: 'Promo' | 'Combo' | 'Boxs' (fijas)
-- La promo define su categoria y la Carta + el menu publico la heredan EN VIVO
-- (igual que el precio del combo). Se elige en el editor de Promos/Boxs.
-- Ejecutar una sola vez en phpMyAdmin (con la base seleccionada primero).
-- ============================================================================

ALTER TABLE ofertas
  ADD COLUMN categoria_carta VARCHAR(20) NOT NULL DEFAULT 'Promo' AFTER tipo;

-- Preservar lo que ya esta en la carta: si un item de carta mapeado a la promo
-- ya tenia una de las 3 categorias (ej: los Box importados como 'Boxs'),
-- la promo hereda esa para que el menu no cambie solo.
UPDATE ofertas o
JOIN carta_items ci ON ci.oferta_id = o.id AND ci.activo = 1
SET o.categoria_carta = ci.categoria
WHERE ci.categoria IN ('Promo', 'Combo', 'Boxs');
