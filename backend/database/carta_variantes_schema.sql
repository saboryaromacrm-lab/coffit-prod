-- ============================================================================
-- VARIANTES DE CARTA (tamaños, sabores, toppings) + fecha de lanzamiento
-- Ejecutar una sola vez en phpMyAdmin. Solo agrega columnas (no destructivo).
-- Las columnas `sabores` y `toppings` ya existian (TEXT con comas) y pasan a
-- guardar JSON: el backend entiende ambos formatos, asi que no se rompe nada.
-- Despues de cargar/editar, corre el boton "Migrar variantes" en el panel
-- (o el endpoint POST /api/carta/normalizar-variantes) para pasar todo a JSON
-- y sembrar fecha_lanzamiento desde la fecha de creacion original.
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN tamanos TEXT NULL AFTER toppings,
  ADD COLUMN fecha_lanzamiento DATE NULL AFTER tamanos;

-- Ventana de dias para mostrar un item/sabor como "nuevo" (configurable).
INSERT INTO configuracion (clave, valor, descripcion)
VALUES ('dias_nuevo_carta', '45', 'Dias que un item o sabor se muestra como nuevo en la carta')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
