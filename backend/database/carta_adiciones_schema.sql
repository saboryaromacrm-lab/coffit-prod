-- ============================================================================
-- ADICIONES en items de carta
-- Un item de carta puede ofrecer adiciones (ej: "+ panceta"), que se vinculan
-- a PRODUCTOS reales de la categoria "Adiciones" de la seccion Productos.
-- Se guarda JSON: [{ "producto_id": 12, "precio": null }]
--   precio null  = cobra el precio_publico del producto adicion (en vivo)
--   precio 1500  = override manual del extra
-- Nombre, precio y costo se resuelven EN VIVO desde el producto -> siempre sync.
-- Ejecutar una sola vez en phpMyAdmin (con la base seleccionada).
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN adiciones TEXT NULL AFTER tamanos;
