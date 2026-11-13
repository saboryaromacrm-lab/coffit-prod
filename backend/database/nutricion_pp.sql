-- ============================================================================
-- CONTROL DE LA INFO NUTRICIONAL DE PEDIDOS PERSONALIZADOS
--
-- Igual que productos (nutricion_ia.sql): la info se calcula con la receta
-- base y solo sale en el catalogo publico (/api/public/pp/catalogo) cuando
-- alguien la controla. La huella = sha1 de los valores controlados: si
-- despues cambia la receta o un ingrediente, el control se vence solo.
-- ============================================================================

ALTER TABLE pp_productos
  ADD COLUMN nutri_controlado_at DATETIME NULL,
  ADD COLUMN nutri_huella CHAR(40) NULL;
