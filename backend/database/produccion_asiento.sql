-- Como se asienta cada producto / subreceta en Produccion.
-- asiento_unidad: nombre de la unidad con que se carga (plancha, bandeja, tanda...).
--   NULL = "receta" (la receta completa, como se interpreto siempre).
-- asiento_rinde: cuanto es 1 de esa unidad en la unidad de la receta: unidades
--   (productos), porciones o gramos (subrecetas). NULL = la receta completa
--   (sigue al rendimiento aunque cambie).
-- Los registros siguen la configuracion actual de su producto: al configurarlo
-- se reinterpretan los cargados antes. produccion_registros.rinde guarda solo
-- cuando en esa carga la unidad rindio distinto ("esta plancha dio 3").

ALTER TABLE productos
  ADD COLUMN asiento_unidad VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN asiento_rinde DECIMAL(12,3) DEFAULT NULL;

ALTER TABLE subrecetas
  ADD COLUMN asiento_unidad VARCHAR(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN asiento_rinde DECIMAL(12,3) DEFAULT NULL;

ALTER TABLE produccion_registros
  ADD COLUMN rinde DECIMAL(12,3) DEFAULT NULL AFTER cantidad;
