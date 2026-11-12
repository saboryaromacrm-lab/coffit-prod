-- ============================================================================
-- INFO NUTRICIONAL CALCULADA DESDE LOS INGREDIENTES (con sugerencia de IA)
--
-- Cada ingrediente guarda sus valores CADA 100 g y cuantos gramos pesa 1
-- unidad de receta (la unidad en que se cargan las cantidades: g, ml, huevo,
-- porcion...). Subrecetas y productos se CALCULAN con la receta: no se cargan.
--
-- Reemplaza a las columnas viejas, que estaban vacias en todas las filas:
--   ingredientes.calorias/carbohidratos/proteinas/grasas/fibra (DEFAULT 0,
--   no distinguian "0" de "sin datos") y subrecetas.nutri_* (carga manual).
-- ============================================================================

ALTER TABLE ingredientes
  DROP COLUMN calorias,
  DROP COLUMN carbohidratos,
  DROP COLUMN proteinas,
  DROP COLUMN grasas,
  DROP COLUMN fibra,
  ADD COLUMN gramos_por_unidad DECIMAL(12,4) NULL AFTER desperdicio,
  ADD COLUMN nutri_energia_kcal DECIMAL(10,2) NULL AFTER notas,
  ADD COLUMN nutri_proteinas_g DECIMAL(10,2) NULL AFTER nutri_energia_kcal,
  ADD COLUMN nutri_carbohidratos_g DECIMAL(10,2) NULL AFTER nutri_proteinas_g,
  ADD COLUMN nutri_azucares_g DECIMAL(10,2) NULL AFTER nutri_carbohidratos_g,
  ADD COLUMN nutri_fibra_g DECIMAL(10,2) NULL AFTER nutri_azucares_g,
  ADD COLUMN nutri_grasas_g DECIMAL(10,2) NULL AFTER nutri_fibra_g,
  ADD COLUMN nutri_grasas_sat_g DECIMAL(10,2) NULL AFTER nutri_grasas_g,
  ADD COLUMN nutri_grasas_trans_g DECIMAL(10,2) NULL AFTER nutri_grasas_sat_g,
  ADD COLUMN nutri_sodio_mg DECIMAL(10,2) NULL AFTER nutri_grasas_trans_g,
  -- NULL = sin datos | sin_revisar = cargado (por la IA o a mano), falta
  -- controlarlo | controlado
  ADD COLUMN nutri_estado ENUM('sin_revisar','controlado') NULL AFTER nutri_sodio_mg,
  -- Solo la pone la IA: si se edita a mano vuelve a NULL
  ADD COLUMN nutri_confianza ENUM('alta','media','baja') NULL AFTER nutri_estado,
  ADD COLUMN nutri_nota TEXT NULL AFTER nutri_confianza,
  -- Lineas de receta con la cantidad sospechosa (ej. 40 kg de granola en un
  -- bowl): [{tipo:'producto'|'subreceta', linea_id, cantidad, motivo}]
  ADD COLUMN nutri_alertas JSON NULL AFTER nutri_nota,
  ADD COLUMN nutri_controlado_at DATETIME NULL AFTER nutri_alertas;

ALTER TABLE subrecetas
  DROP COLUMN nutri_energia_kcal,
  DROP COLUMN nutri_proteinas_g,
  DROP COLUMN nutri_carbohidratos_g,
  DROP COLUMN nutri_azucares_g,
  DROP COLUMN nutri_grasas_g,
  DROP COLUMN nutri_grasas_sat_g,
  DROP COLUMN nutri_grasas_trans_g,
  DROP COLUMN nutri_sodio_mg;

-- Control del producto: cuando y sobre que valores. Si la receta o un
-- ingrediente cambian, la huella deja de coincidir y el control se vence.
ALTER TABLE productos
  ADD COLUMN nutri_controlado_at DATETIME NULL,
  ADD COLUMN nutri_huella CHAR(40) NULL AFTER nutri_controlado_at;
