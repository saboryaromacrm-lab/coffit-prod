-- ============================================================================
-- LIMPIEZA FINAL: elimina las columnas muertas que venian del Google Sheets.
-- Estas columnas ya fueron reemplazadas:
--   tamano_mas_grande      -> plegado en `tamanos`
--   nuevo_sabor            -> reemplazado por el flag por-sabor
--   fecha_creacion_origen  -> sembrado en `fecha_lanzamiento`
--   fecha_modificacion_origen -> ya no se usa
--
-- IMPORTANTE: correr ESTO SOLO DESPUES de haber ejecutado "Migrar variantes"
-- en el panel (boton) al menos una vez, para no perder el sembrado de datos.
-- ============================================================================

ALTER TABLE carta_items
  DROP COLUMN tamano_mas_grande,
  DROP COLUMN nuevo_sabor,
  DROP COLUMN fecha_creacion_origen,
  DROP COLUMN fecha_modificacion_origen;
