-- ============================================================================
-- OBSERVACION por linea de receta de un producto
--
-- Una nota libre en cada ingrediente / subreceta / item manual de la receta
-- (ej: "cortado en cubos", "marca X", "agregar al final"). No afecta costos.
--
-- Ejecutar una sola vez (con la base seleccionada), ANTES de deployar el
-- backend que la usa.
-- ============================================================================

ALTER TABLE producto_ingredientes
  ADD COLUMN observacion VARCHAR(255) NULL AFTER unidad;
