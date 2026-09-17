-- ============================================================================
-- INFO NUTRICIONAL POR UNIDAD en subrecetas
-- Valores POR UNIDAD (1 porcion si tipo_rendimiento='porciones', o por 100g
-- si tipo_rendimiento='gramos' — criterio definido por el usuario al cargar).
-- Todos opcionales (NULL = sin datos).
-- Ejecutar una sola vez en la base de Hostinger (phpMyAdmin, con la base
-- seleccionada primero).
-- ============================================================================

ALTER TABLE subrecetas
  ADD COLUMN nutri_energia_kcal DECIMAL(10,2) NULL AFTER notas,
  ADD COLUMN nutri_proteinas_g DECIMAL(10,2) NULL AFTER nutri_energia_kcal,
  ADD COLUMN nutri_carbohidratos_g DECIMAL(10,2) NULL AFTER nutri_proteinas_g,
  ADD COLUMN nutri_azucares_g DECIMAL(10,2) NULL AFTER nutri_carbohidratos_g,
  ADD COLUMN nutri_grasas_g DECIMAL(10,2) NULL AFTER nutri_azucares_g,
  ADD COLUMN nutri_grasas_sat_g DECIMAL(10,2) NULL AFTER nutri_grasas_g,
  ADD COLUMN nutri_grasas_trans_g DECIMAL(10,2) NULL AFTER nutri_grasas_sat_g,
  ADD COLUMN nutri_sodio_mg DECIMAL(10,2) NULL AFTER nutri_grasas_trans_g;
