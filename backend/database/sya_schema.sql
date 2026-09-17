-- ============================================================================
-- SECCION "SABOR Y AROMA": envios de mercaderia del CRM de la distribuidora
--
-- Flujo: se pega el JSON del sync del CRM -> coffit registra los envios y sus
-- renglones -> cada articulo del CRM se MAPEA una sola vez (a un ingrediente
-- como materia prima y/o al apartado "Para venta") -> los renglones mapeados
-- se aplican (actualizan costo del ingrediente / costo del articulo de venta).
--
-- Identidad estable: (crm_producto_id, crm_presentacion_id). El CRM manda
-- presentacionId NULL para granel/unidad: se guarda 0 (NULL romperia la clave
-- unica en MySQL: NULL != NULL, y con eso la idempotencia).
--
-- Independiente de envios_coffit / envios_saboryaroma: tablas propias.
--
-- Ejecutar UNA SOLA VEZ en phpMyAdmin, SELECCIONANDO LA BASE PRIMERO.
-- ============================================================================

-- 1) Catalogo de articulos del CRM + su mapeo ---------------------------------
-- Un articulo puede tener LOS DOS destinos a la vez (materia prima y venta).
CREATE TABLE sya_articulos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  crm_producto_id INT NOT NULL,
  crm_presentacion_id INT NOT NULL DEFAULT 0,   -- 0 = null del CRM
  -- Ayuda visual (se refresca en cada import; NUNCA se mapea por nombre)
  nombre_crm VARCHAR(150) NOT NULL,
  codigo_propio VARCHAR(50) NULL,
  codigo_barras VARCHAR(50) NULL,
  ultimo_modo VARCHAR(10) NULL,                 -- granel | paquete | unidad
  ultima_cantidad DECIMAL(12,3) NULL,
  ultimo_costo_unitario DECIMAL(14,4) NULL,     -- $ por unidad del modo
  ultima_fecha DATETIME NULL,
  -- Destino MATERIA PRIMA (-> ingrediente)
  usa_mp TINYINT(1) NOT NULL DEFAULT 0,
  ingrediente_id INT NULL,
  factor_mp DECIMAL(14,6) NULL,     -- unidades del ingrediente por 1 unidad CRM (ej: kg->g = 1000)
  factor_modo VARCHAR(10) NULL,     -- modo del CRM para el que se calibro el factor
  actualizar_costo TINYINT(1) NOT NULL DEFAULT 1,
  -- Destino PARA VENTA (se vende tal cual; vive en este apartado, no en Productos)
  usa_venta TINYINT(1) NOT NULL DEFAULT 0,
  venta_nombre VARCHAR(150) NULL,
  venta_precio DECIMAL(12,2) NULL,              -- lo pone coffit a mano
  venta_activo TINYINT(1) NOT NULL DEFAULT 1,
  venta_costo_unitario DECIMAL(14,4) NULL,      -- ultimo costo aplicado ($/unidad)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sya_articulo (crm_producto_id, crm_presentacion_id),
  INDEX idx_sya_art_ing (ingrediente_id)
);

-- 2) Envios (cabecera). crm_id UNIQUE = idempotencia --------------------------
CREATE TABLE sya_envios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  crm_id INT NOT NULL,
  codigo VARCHAR(20) NULL,                      -- CAF0010
  fecha DATETIME NULL,
  sucursal_id INT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'enviado', -- enviado | anulado | ignorado
  version INT NOT NULL DEFAULT 1,
  total_costo DECIMAL(14,2) NULL,
  observaciones TEXT NULL,
  motivo_anulacion TEXT NULL,
  actualizado_en_crm DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sya_envio_crm (crm_id)
);

-- 3) Renglones del envio + resultado de su aplicacion -------------------------
-- Se guarda el renglon CRUDO como llego (auditoria) mas el resultado.
-- En ediciones (version nueva) se borran y se reinsertan completos.
CREATE TABLE sya_envio_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  envio_id INT NOT NULL,
  crm_item_id INT NOT NULL,
  crm_producto_id INT NOT NULL,
  crm_presentacion_id INT NOT NULL DEFAULT 0,
  nombre_crm VARCHAR(150) NULL,
  modo VARCHAR(10) NOT NULL,                    -- granel | paquete | unidad
  cantidad DECIMAL(12,3) NOT NULL,
  tam_kg DECIMAL(10,3) NULL,
  total_kg DECIMAL(12,3) NULL,
  costo_unitario DECIMAL(14,4) NOT NULL,        -- $ por unidad del modo
  -- Resultado de la aplicacion
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente_mapeo',
    -- pendiente_mapeo | aplicado | inconsistente | anulado
  nota VARCHAR(255) NULL,                       -- motivo si inconsistente
  cant_mp DECIMAL(12,3) NULL,                   -- reparto (en unidad CRM)
  cant_venta DECIMAL(12,3) NULL,
  cantidad_ingrediente DECIMAL(14,3) NULL,      -- cant_mp * factor (unidad del ingrediente)
  ingrediente_id INT NULL,                      -- snapshot de a que ingrediente fue
  costo_aplicado TINYINT(1) NOT NULL DEFAULT 0, -- 1 = este renglon actualizo el costo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sya_item (envio_id, crm_item_id),
  INDEX idx_sya_item_articulo (crm_producto_id, crm_presentacion_id),
  CONSTRAINT fk_sya_item_envio FOREIGN KEY (envio_id) REFERENCES sya_envios(id) ON DELETE CASCADE
);

-- 4) Marca "actualizado por Sabor y Aroma" en el ingrediente ------------------
-- Queda con la fecha del ultimo envio que lo toco (no se borra al editar a mano).
ALTER TABLE ingredientes
  ADD COLUMN sya_fecha DATE NULL DEFAULT NULL,
  ADD COLUMN sya_codigo VARCHAR(20) NULL DEFAULT NULL;

-- 5) Claves de configuracion (el PUT de configuracion exige que existan) ------
INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('sya_cursor', '', 'Cursor de sincronizacion del CRM (campo "ahora" de la ultima respuesta procesada)'),
  ('sya_sucursal_id', '', 'Si se completa, solo se ingresan envios de esa sucursal del CRM (vacio = todas)'),
  ('sya_crm_url', 'http://192.168.0.10:3001', 'URL base del CRM en la red local (para armar el link del sync)');
