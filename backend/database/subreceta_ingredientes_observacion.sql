-- ============================================================================
-- OBSERVACION por linea de receta de una subreceta
--
-- Igual que producto_ingredientes.observacion: una nota libre en cada
-- ingrediente (ej: "tamizada", "a temperatura ambiente"). No afecta costos.
--
-- Ejecutar una sola vez (con la base seleccionada), ANTES de deployar el
-- backend que la usa.
-- ============================================================================

ALTER TABLE subreceta_ingredientes
  ADD COLUMN observacion VARCHAR(255) NULL AFTER unidad;
