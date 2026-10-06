-- ============================================================================
-- MODULO PEDIDOS PERSONALIZADOS (prefijo pp_)
-- Productos que el cliente arma eligiendo opciones (harina, relleno, toppings,
-- version y tamano de torta...). Precio y costo salen de un solo motor
-- (src/modules/pedidosPersonalizados/motor.js) y el POS los consume por
-- /api/public/pp. Modulo aparte: no toca carta ni productos; para costear
-- solo LEE ingredientes, subrecetas y productos.
--
-- Modelo: producto -> pasos (cuantas opciones se eligen) -> opciones.
--   * Una opcion suma su precio fijo, o precio x kg del item (precio_modo).
--   * El peso del item es la suma del peso de las opciones elegidas (tamano).
--   * depende_de_opcion_id: la opcion solo aparece si se eligio esa otra
--     (tamanos de cada version). En un paso, si hay opciones que dependen de
--     algo elegido se muestran SOLO esas; si no, las generales (asi una
--     version con toppings propios reemplaza la lista general).
--   * Un paso puede usar un grupo de la biblioteca (toppings compartidos
--     entre productos), con precio propio u oculto por paso.
--   * Receta (costo) en el producto base y en cada opcion; una linea puede
--     ser por kg (se multiplica por el peso del item).
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pp_productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(500) NULL,
  categoria VARCHAR(80) NULL,
  imagen VARCHAR(255) NULL,
  emoji VARCHAR(16) NULL,
  precio_base DECIMAL(12,2) NOT NULL DEFAULT 0,  -- se suma siempre (producto simple = solo esto)
  etiquetas JSON NULL,                           -- ["SIN TACC", "KETO"]
  es_congelado TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  origen_ref VARCHAR(40) NULL,                   -- id en la app de pedidos (import), para no duplicar
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pp_productos_origen (origen_ref)
);

-- Biblioteca: listas de opciones reutilizables (ej. "Toppings")
CREATE TABLE IF NOT EXISTS pp_grupos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  origen_ref VARCHAR(40) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pp_grupos_origen (origen_ref)
);

CREATE TABLE IF NOT EXISTS pp_pasos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,                  -- "Elegi tu harina"
  orden INT NOT NULL DEFAULT 0,
  min_sel INT NOT NULL DEFAULT 0,                -- 0 = opcional
  max_sel INT NOT NULL DEFAULT 1,
  grupo_id INT NULL,                             -- usa ademas las opciones de un grupo
  KEY idx_pp_pasos_producto (producto_id),
  CONSTRAINT fk_pp_pasos_producto FOREIGN KEY (producto_id) REFERENCES pp_productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_pasos_grupo FOREIGN KEY (grupo_id) REFERENCES pp_grupos(id) ON DELETE SET NULL
);

-- Una opcion pertenece a un paso O a un grupo (nunca a los dos)
CREATE TABLE IF NOT EXISTS pp_opciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paso_id INT NULL,
  grupo_id INT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(300) NULL,
  precio DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_modo ENUM('fijo','por_kg') NOT NULL DEFAULT 'fijo',
  peso_kg DECIMAL(8,3) NULL,                     -- aporta peso al item (tamano)
  depende_de_opcion_id INT NULL,                 -- solo visible si se eligio esa opcion
  etiquetas JSON NULL,
  imagen VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  KEY idx_pp_opciones_paso (paso_id),
  KEY idx_pp_opciones_grupo (grupo_id),
  CONSTRAINT fk_pp_opciones_paso FOREIGN KEY (paso_id) REFERENCES pp_pasos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_opciones_grupo FOREIGN KEY (grupo_id) REFERENCES pp_grupos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_opciones_padre FOREIGN KEY (depende_de_opcion_id) REFERENCES pp_opciones(id) ON DELETE CASCADE
);

-- Ajuste de una opcion de grupo dentro de un paso: otro precio, u oculta
CREATE TABLE IF NOT EXISTS pp_paso_ajustes (
  paso_id INT NOT NULL,
  opcion_id INT NOT NULL,
  precio DECIMAL(12,2) NULL,                     -- NULL = precio del grupo
  oculto TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (paso_id, opcion_id),
  CONSTRAINT fk_pp_ajustes_paso FOREIGN KEY (paso_id) REFERENCES pp_pasos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_ajustes_opcion FOREIGN KEY (opcion_id) REFERENCES pp_opciones(id) ON DELETE CASCADE
);

-- Receta (costo) del producto base o de una opcion.
-- Fuente: ingrediente | subreceta | producto de CoffitCost | manual.
CREATE TABLE IF NOT EXISTS pp_receta_lineas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NULL,                          -- dueno: producto base...
  opcion_id INT NULL,                            -- ...u opcion
  ingrediente_id INT NULL,
  subreceta_id INT NULL,
  cc_producto_id INT NULL,                       -- producto ya costeado en CoffitCost (costo por porcion)
  nombre_manual VARCHAR(120) NULL,
  costo_manual DECIMAL(14,4) NULL,
  cantidad DECIMAL(12,3) NOT NULL DEFAULT 1,
  por_kg TINYINT(1) NOT NULL DEFAULT 0,          -- cantidad por kg del item
  KEY idx_pp_receta_producto (producto_id),
  KEY idx_pp_receta_opcion (opcion_id),
  CONSTRAINT fk_pp_receta_producto FOREIGN KEY (producto_id) REFERENCES pp_productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_receta_opcion FOREIGN KEY (opcion_id) REFERENCES pp_opciones(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- PEDIDOS: foto inmutable de nombres, precios y costos del momento.
-- (origen, ref_externa) UNIQUE = idempotencia: si el POS reintenta con el
-- mismo id de venta no se duplica.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pp_pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(20) NOT NULL,                   -- PP-AAAAMMDD-NNNN
  origen VARCHAR(20) NOT NULL,                   -- pos | web | panel
  ref_externa VARCHAR(80) NULL,                  -- id de la venta en el POS
  cliente_nombre VARCHAR(150) NULL,
  cliente_telefono VARCHAR(40) NULL,
  notas VARCHAR(1000) NULL,
  fecha_entrega DATETIME NULL,
  estado ENUM('pendiente','en_produccion','listo','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  total DECIMAL(14,2) NOT NULL,
  costo_total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pp_pedidos_numero (numero),
  UNIQUE KEY uq_pp_pedidos_ref (origen, ref_externa),
  KEY idx_pp_pedidos_estado (estado, created_at)
);

CREATE TABLE IF NOT EXISTS pp_pedido_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  producto_id INT NULL,                          -- referencia, sin FK: el pedido sobrevive al producto
  nombre VARCHAR(150) NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL,
  peso_kg DECIMAL(8,3) NULL,
  notas VARCHAR(300) NULL,
  KEY idx_pp_items_pedido (pedido_id),
  CONSTRAINT fk_pp_items_pedido FOREIGN KEY (pedido_id) REFERENCES pp_pedidos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pp_pedido_item_opciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  opcion_id INT NULL,
  paso_nombre VARCHAR(100) NOT NULL,
  opcion_nombre VARCHAR(150) NOT NULL,
  precio DECIMAL(12,2) NOT NULL,                 -- lo que aporto al precio del item
  costo DECIMAL(12,2) NOT NULL,
  KEY idx_pp_item_opciones_item (item_id),
  CONSTRAINT fk_pp_item_opciones_item FOREIGN KEY (item_id) REFERENCES pp_pedido_items(id) ON DELETE CASCADE
);
