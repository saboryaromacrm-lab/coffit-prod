-- ============================================================================
-- HISTORIAL DE PRECIOS DE PRODUCTOS
--
-- Hasta ahora productos solo guardaba el ULTIMO cambio (precio_anterior_local
-- + fecha_cambio_precio): cada cambio pisaba al anterior y la evolucion se
-- perdia. Esta tabla guarda una fila por cada cambio del precio local.
--
-- origen:
--   'alta'      = precio con el que se creo el producto (precio_anterior NULL)
--   'producto'  = editado desde la seccion Productos
--   'carta'     = editado desde la Carta (write-through al producto)
--   'historico' = sembrado desde precio_anterior_local al crear esta tabla
--
-- La siembra solo puede recuperar el ultimo cambio de cada producto: lo que
-- paso antes no quedo guardado en ningun lado.
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

CREATE TABLE producto_precios_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  precio_anterior DECIMAL(12,2) NULL,
  precio_nuevo DECIMAL(12,2) NOT NULL,
  origen VARCHAR(20) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_producto_fecha (producto_id, fecha),
  CONSTRAINT fk_precios_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Siembra: el unico cambio conocido de cada producto. precio_publico actual es
-- el precio_nuevo de ese cambio, porque fecha_cambio_precio se actualiza en
-- cada cambio (no hubo otro despues).
INSERT INTO producto_precios_historial (producto_id, precio_anterior, precio_nuevo, origen, fecha)
SELECT id, precio_anterior_local, precio_publico, 'historico', fecha_cambio_precio
FROM productos
WHERE precio_anterior_local IS NOT NULL AND fecha_cambio_precio IS NOT NULL;
