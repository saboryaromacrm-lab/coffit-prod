-- Forma en que se anoto cada carga de Produccion, elegida al cargar:
--   NULL     = en la unidad configurada del producto (plancha, bandeja...; sin
--              configurar, la receta). Sigue a la configuracion actual, como
--              los registros de antes.
--   'receta' = recetas completas.
--   'base'   = la unidad suelta de su receta: unidades, porciones o kg.
-- 'receta' y 'base' quedan fijas aunque despues cambie la configuracion.

ALTER TABLE produccion_registros
  ADD COLUMN forma ENUM('receta', 'base') DEFAULT NULL AFTER rinde;
