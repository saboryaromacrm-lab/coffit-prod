-- Info nutricional: reglas de verificacion (2026-11-20)
--  1. Carbohidratos DISPONIBLES (sin fibra, como el rotulo Mercosur).
--  3. Energia calculada con los factores del rotulo: 4 prot + 4 carbs + 9 grasas + 2 fibra.
--  4. Cada ingrediente guarda la fuente de sus valores (sin fuente no se controla).
-- Correr ANTES de desplegar el codigo que lee nutri_fuente.

ALTER TABLE ingredientes ADD COLUMN nutri_fuente VARCHAR(255) NULL AFTER nutri_nota;

-- Ingredientes cargados con los carbohidratos totales de USDA (la energia
-- guardada solo cerraba con la fibra incluida): se pasan a disponibles.
UPDATE ingredientes SET nutri_carbohidratos_g = nutri_carbohidratos_g - nutri_fibra_g
WHERE id IN (197, 62, 74, 181, 223, 69, 244, 67, 104, 114, 119, 212, 110, 183, 116, 34,
             180, 121, 129, 122, 118, 101, 261, 156, 201, 57, 140, 70, 131, 87, 35)
  AND nutri_estado IS NOT NULL AND nutri_carbohidratos_g >= nutri_fibra_g;

-- Energia de todos con los factores
UPDATE ingredientes
SET nutri_energia_kcal = ROUND(4 * nutri_proteinas_g + 4 * nutri_carbohidratos_g + 9 * nutri_grasas_g + 2 * nutri_fibra_g, 2)
WHERE nutri_estado IS NOT NULL;
