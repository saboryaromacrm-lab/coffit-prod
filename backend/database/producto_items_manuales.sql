-- ============================================================================
-- ITEMS MANUALES en la receta de un producto
--
-- A veces hay un costo que no justifica dar de alta un ingrediente en el
-- catalogo (algo que se compra una sola vez, un insumo puntual, un costo
-- estimado). Hasta ahora toda linea de receta tenia que apuntar si o si a un
-- ingrediente o a una subreceta.
--
-- Una fila es MANUAL cuando ingrediente_id y subreceta_id son NULL y
-- nombre_manual tiene valor. Su aporte al costo es cantidad * costo_manual,
-- igual que las otras dos clases de linea.
--
-- Diferencia importante: el costo de un item manual es FIJO. No se recalcula
-- solo cuando cambian precios (no tiene de donde), asi que si el insumo
-- cambia de precio hay que editarlo a mano. Es el precio de no ensuciar el
-- catalogo con cosas de una sola vez.
--
-- Al ser ambos ids NULL, estas filas quedan naturalmente fuera de los conteos
-- de uso de ingredientes, del descuento de stock en Produccion y de las
-- cascadas de recalculo, que es justo lo que corresponde.
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

ALTER TABLE producto_ingredientes
  ADD COLUMN nombre_manual VARCHAR(120) NULL AFTER subreceta_id,
  ADD COLUMN costo_manual DECIMAL(12,4) NULL AFTER nombre_manual;
