-- ============================================================================
-- EXCLUSIONES DEL CHECKLIST DE CARTA
--
-- Permite sacar del control productos sueltos o categorias enteras (ej: las
-- bebidas embotelladas no hace falta controlarlas). Lo excluido no le aparece
-- a quien controla por su link y no cuenta en el avance. Solo se excluye desde
-- la app, nunca desde un link de colaborador.
--
--   carta_checklist.excluido          -> un producto puntual
--   carta_checklist_categorias_excluidas -> una categoria (raiz) completa
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

ALTER TABLE carta_checklist
  ADD COLUMN excluido TINYINT(1) NOT NULL DEFAULT 0 AFTER observacion;

CREATE TABLE carta_checklist_categorias_excluidas (
  categoria VARCHAR(120) PRIMARY KEY,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
