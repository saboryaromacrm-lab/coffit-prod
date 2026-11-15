-- ============================================================================
-- PASOS DE ELECCION DE UN COMBO (Promos/Boxs, tipo precio_especial)
--
-- "Infusion + Cookie": el cliente elige un producto de cada paso. JSON:
--   [{ "nombre": "Infusion", "opciones": [{ "producto_id": 12, "extra": 500 }] }]
-- extra = recargo de la opcion. El nombre del producto se resuelve en vivo y
-- viaja a la carta publica como grupo de opciones con componente: true.
-- Correr ANTES del deploy: la carta publica lee esta columna.
-- ============================================================================

ALTER TABLE ofertas
  ADD COLUMN pasos TEXT NULL;
