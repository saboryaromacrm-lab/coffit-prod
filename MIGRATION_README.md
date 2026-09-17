# CoffitCost - Documentación Completa para Migración

## Stack Objetivo
- **Frontend**: React 18.x + TypeScript + Vite 7.x
- **Estilos**: Tailwind CSS v4
- **Estado Global**: Zustand 5.x
- **Data Fetching**: Axios + React Query 5.x
- **Gráficos**: Recharts 2.x
- **Backend**: Node.js + Express 18.x
- **Base de Datos**: MySQL 5.x (Hostinger) - **SE MANTIENE IGUAL**
- **Hosting Frontend**: Vercel
- **Hosting Backend**: Hostinger (Node.js)
- **Fuente**: DM Sans (Google Fonts)

---

## 1. DESCRIPCIÓN DEL PROYECTO

CoffitCost es un sistema de gestión de costos, recetas y rentabilidad para cafeterías. Permite:

- Gestionar ingredientes con precios, proveedores y desperdicio
- Crear subrecetas (preparaciones base reutilizables)
- Crear productos finales con sus costos calculados
- Calcular rentabilidad por canal de venta (Local Tarjeta, Local Efectivo, PedidosYa)
- Gestionar ofertas y promociones
- Configurar impuestos y comisiones dinámicamente
- Ver dashboard con alertas de bajo margen

---

## 2. ESQUEMA DE BASE DE DATOS

### 2.1 Tabla: `unidades`
```sql
CREATE TABLE unidades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,        -- "Kilogramos", "Gramos", etc.
    abreviatura VARCHAR(10) NOT NULL,   -- "kg", "g", "ml", "L", "u", "doc"
    activo TINYINT(1) DEFAULT 1
);

-- Datos iniciales:
-- 1: Gramos (g)
-- 2: Kilogramos (kg)
-- 3: Mililitros (ml)
-- 4: Litros (L)
-- 5: Unidad (u)
-- 6: Docena (doc)
```

### 2.2 Tabla: `configuracion`
```sql
CREATE TABLE configuracion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT,
    descripcion VARCHAR(255)
);

-- Claves importantes:
-- 'iva' = 10.5
-- 'iibb' = 3.3
-- 'comision_tarjeta' = 3
-- 'descuento_efectivo' = 10
-- 'comision_pedidosya' = 22
-- 'moneda' = 'ARS'
-- 'nombre_negocio' = 'CoffitCost'
```

### 2.3 Tabla: `proveedores`
```sql
CREATE TABLE proveedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(100),
    direccion TEXT,
    notas TEXT,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.4 Tabla: `categorias_ingredientes`
```sql
CREATE TABLE categorias_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,       -- "Frutas", "Verduras", "Lacteos", etc.
    color VARCHAR(20) DEFAULT '#666666',
    activo TINYINT(1) DEFAULT 1
);
```

### 2.5 Tabla: `categorias_productos`
```sql
CREATE TABLE categorias_productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,       -- "Bowls", "Bebidas", "Postres", etc.
    icono VARCHAR(10) DEFAULT '📦',
    color VARCHAR(20) DEFAULT '#666666',
    orden INT DEFAULT 0,
    activo TINYINT(1) DEFAULT 1
);
```

### 2.6 Tabla: `ingredientes`
```sql
CREATE TABLE ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(100),             -- Texto libre (no FK)
    unidad_id INT,                      -- FK a unidades
    contenido_envase DECIMAL(10,2) DEFAULT 1,  -- Ej: 17 (kg)
    desperdicio DECIMAL(5,2) DEFAULT 0,        -- Ej: 10 (%)
    proveedor1 VARCHAR(100),            -- Texto libre (nombre proveedor)
    precio1 DECIMAL(12,2) DEFAULT 0,    -- Precio de compra del envase
    proveedor2 VARCHAR(100),            -- Proveedor alternativo
    precio2 DECIMAL(12,2) DEFAULT 0,
    costo_unitario DECIMAL(12,4) DEFAULT 0,         -- Calculado: precio1 / contenido_envase
    costo_con_desperdicio DECIMAL(12,4) DEFAULT 0,  -- Calculado (ver fórmula)
    fecha_precio DATE,                  -- Fecha última actualización precio
    notas TEXT,
    -- Campos nutricionales (opcionales):
    calorias DECIMAL(8,2) DEFAULT 0,
    carbohidratos DECIMAL(8,2) DEFAULT 0,
    proteinas DECIMAL(8,2) DEFAULT 0,
    grasas DECIMAL(8,2) DEFAULT 0,
    fibra DECIMAL(8,2) DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (unidad_id) REFERENCES unidades(id) ON DELETE SET NULL
);
```

### 2.7 Tabla: `subrecetas`
```sql
CREATE TABLE subrecetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rendimiento_gramos DECIMAL(10,2) DEFAULT 100,  -- O cantidad de porciones
    tipo_rendimiento VARCHAR(20) DEFAULT 'gramos', -- 'gramos' o 'porciones'
    costo_total DECIMAL(12,2) DEFAULT 0,           -- Calculado: suma de ingredientes
    costo_por_100g DECIMAL(12,4) DEFAULT 0,        -- Calculado
    notas TEXT,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 2.8 Tabla: `subreceta_ingredientes`
```sql
CREATE TABLE subreceta_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subreceta_id INT NOT NULL,
    ingrediente_id INT NOT NULL,
    cantidad DECIMAL(10,4) NOT NULL DEFAULT 0,  -- En la unidad del ingrediente
    unidad VARCHAR(20) DEFAULT 'g',             -- Unidad usada (g, kg, ml, etc.)
    FOREIGN KEY (subreceta_id) REFERENCES subrecetas(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE
);
```

### 2.9 Tabla: `productos`
```sql
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    categoria_id INT,                           -- FK a categorias_productos
    porciones INT DEFAULT 1,                    -- Cantidad de porciones que rinde
    precio_publico DECIMAL(12,2) DEFAULT 0,     -- Precio venta local
    precio_pedidosya DECIMAL(12,2) DEFAULT 0,   -- Precio venta PedidosYa
    costo_total DECIMAL(12,2) DEFAULT 0,        -- Calculado: costo por porción
    es_borrador TINYINT(1) DEFAULT 0,           -- 0=publicado, 1=borrador
    notas TEXT,
    -- Columnas opcionales para historial de precios:
    precio_anterior_local DECIMAL(12,2),
    precio_anterior_pedidosya DECIMAL(12,2),
    fecha_cambio_precio DATETIME,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_productos(id) ON DELETE SET NULL
);
```

### 2.10 Tabla: `producto_ingredientes`
```sql
CREATE TABLE producto_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    ingrediente_id INT,                 -- FK a ingredientes (NULL si es subreceta)
    subreceta_id INT,                   -- FK a subrecetas (NULL si es ingrediente)
    cantidad DECIMAL(10,4) NOT NULL DEFAULT 0,
    unidad VARCHAR(20) DEFAULT 'g',
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE,
    FOREIGN KEY (subreceta_id) REFERENCES subrecetas(id) ON DELETE CASCADE
);
```

### 2.11 Tabla: `ofertas`
```sql
CREATE TABLE ofertas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150),
    tipo VARCHAR(50),                   -- 'descuento_porcentaje', 'descuento_fijo', '2x1', '3x2', 'precio_especial'
    valor DECIMAL(10,2) DEFAULT 0,      -- Valor del descuento o precio especial
    descripcion TEXT,
    fecha_inicio DATE,
    fecha_fin DATE,
    estado VARCHAR(20) DEFAULT 'activa', -- 'activa', 'pausada', 'programada', 'vencida'
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.12 Tabla: `oferta_productos` (relación N:M)
```sql
CREATE TABLE oferta_productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    oferta_id INT NOT NULL,
    producto_id INT NOT NULL,
    FOREIGN KEY (oferta_id) REFERENCES ofertas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);
```

### 2.13 Tabla: `canales_venta`
```sql
CREATE TABLE canales_venta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,  -- 'tarjeta', 'efectivo', 'pedidosya'
    nombre VARCHAR(100) NOT NULL,        -- 'Local Tarjeta', 'Local Efectivo', 'PedidosYa'
    icono VARCHAR(10) DEFAULT '💰',
    color VARCHAR(20) DEFAULT '#666666',
    orden INT DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos iniciales:
-- (1, 'tarjeta', 'Local Tarjeta', '💳', '#4CAF50', 1)
-- (2, 'efectivo', 'Local Efectivo', '💵', '#2196F3', 2)
-- (3, 'pedidosya', 'PedidosYa', '🛵', '#FF5722', 3)
```

### 2.14 Tabla: `conceptos_costo`
```sql
CREATE TABLE conceptos_costo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,        -- 'IVA', 'IIBB', 'Comisión Tarjeta', etc.
    tipo VARCHAR(20) NOT NULL,           -- 'impuesto', 'comision', 'descuento'
    porcentaje DECIMAL(6,2) NOT NULL DEFAULT 0,
    descripcion TEXT,
    es_resta TINYINT(1) DEFAULT 1,       -- 1=resta del precio, 0=suma
    orden INT DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos iniciales:
-- (1, 'IVA', 'impuesto', 10.50, 'Impuesto al Valor Agregado', 1, 1)
-- (2, 'IIBB', 'impuesto', 3.30, 'Ingresos Brutos', 1, 2)
-- (3, 'Comision Tarjeta', 'comision', 3.00, 'Comision por pago con tarjeta', 1, 3)
-- (4, 'Comision PedidosYa', 'comision', 22.00, 'Comision de PedidosYa', 1, 4)
-- (5, 'Descuento Efectivo', 'descuento', 10.00, 'Descuento por pago en efectivo', 1, 5)
```

### 2.15 Tabla: `conceptos_canales` (relación N:M)
```sql
CREATE TABLE conceptos_canales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    concepto_id INT NOT NULL,
    canal_id INT NOT NULL,
    porcentaje_override DECIMAL(6,2) DEFAULT NULL,  -- Override del % base (opcional)
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_concepto_canal (concepto_id, canal_id),
    FOREIGN KEY (concepto_id) REFERENCES conceptos_costo(id) ON DELETE CASCADE,
    FOREIGN KEY (canal_id) REFERENCES canales_venta(id) ON DELETE CASCADE
);

-- Relaciones iniciales:
-- Canal Tarjeta (1): IVA (1), IIBB (2), Comisión Tarjeta (3)
-- Canal Efectivo (2): IVA (1), IIBB (2), Descuento Efectivo (5)
-- Canal PedidosYa (3): IVA (1), IIBB (2), Comisión PedidosYa (4)
```

---

## 3. FÓRMULAS Y CÁLCULOS

### 3.1 Costo Unitario de Ingrediente
```typescript
// Costo base por unidad
costoUnitario = precio / contenido_envase

// Ejemplo: Palta $83000 / 17kg = $4882.35/kg
```

### 3.2 Costo con Desperdicio
```typescript
// Si hay desperdicio, el costo real es mayor
costoConDesperdicio = costoUnitario / (1 - desperdicio / 100)

// Ejemplo con 10% desperdicio:
// $4882.35 / (1 - 0.10) = $4882.35 / 0.90 = $5424.84/kg
```

### 3.3 Costo de Subreceta
```typescript
// Suma de (cantidad * costo_con_desperdicio) de cada ingrediente
costoTotal = ingredientes.reduce((sum, ing) =>
    sum + (ing.cantidad * ing.costo_con_desperdicio), 0)

// Costo por 100g (si tipo_rendimiento = 'gramos')
costoPor100g = (costoTotal / rendimiento_gramos) * 100

// Costo por porción (si tipo_rendimiento = 'porciones')
costoPorPorcion = costoTotal / rendimiento_gramos  // rendimiento_gramos contiene # porciones
```

### 3.4 Costo de Producto
```typescript
// Suma de costos de ingredientes y subrecetas
costoReceta = items.reduce((sum, item) => {
    if (item.tipo === 'ingrediente') {
        return sum + (item.cantidad * item.costo_con_desperdicio)
    } else { // subreceta
        // Costo por unidad de subreceta (g o porción)
        const costoUnitarioSub = subreceta.tipo_rendimiento === 'porciones'
            ? subreceta.costo_total / subreceta.rendimiento_gramos
            : subreceta.costo_por_100g / 100  // costo por gramo
        return sum + (item.cantidad * costoUnitarioSub)
    }
}, 0)

// Costo por porción del producto
costoPorPorcion = costoReceta / producto.porciones
```

### 3.5 Cálculo de MC Neto (Margen de Contribución Neto)

```typescript
interface CalculoMCNeto {
    precioOriginal: number;      // Precio de venta
    precioEfectivo: number;      // Precio después de descuento (si aplica)
    costo: number;               // Costo del producto
    deducciones: number;         // Total de impuestos + comisiones
    ganancia: number;            // Precio - Costo - Deducciones
    mcNeto: number;              // (Ganancia / PrecioEfectivo) * 100
}

function calcularMCNetoCanal(precio: number, costo: number, canal: string): CalculoMCNeto {
    const resumen = RESUMEN_CANALES[canal];
    let totalDeducciones = 0;
    let descuentoMonto = 0;

    // Procesar cada concepto del canal
    for (const concepto of resumen.conceptos) {
        const montoConcepto = precio * (concepto.valor / 100);

        if (concepto.tipo === 'descuento') {
            descuentoMonto = montoConcepto;
        }

        totalDeducciones += montoConcepto;
    }

    // Precio efectivo (después del descuento)
    const precioNeto = precio - descuentoMonto;

    // Ganancia = Precio - Costo - Todas las deducciones
    const ganancia = precio - costo - totalDeducciones;

    // MC Neto sobre el precio que realmente recibimos
    const mcNeto = precioNeto > 0 ? (ganancia / precioNeto) * 100 : 0;

    return { precioOriginal: precio, precioEfectivo: precioNeto, ganancia, mcNeto, ... };
}
```

### 3.6 Ejemplo de Cálculo por Canal

**Producto: Bowl Açaí - Costo: $3500 - Precio Local: $7000 - Precio PY: $8500**

#### Canal Tarjeta (IVA 10.5% + IIBB 3.3% + Comisión 3%)
```
Precio:           $7000
(-) Costo:        $3500
(-) IVA 10.5%:    $735
(-) IIBB 3.3%:    $231
(-) Com. Tarj 3%: $210
= Ganancia:       $2324
MC Neto = $2324 / $7000 = 33.2%
```

#### Canal Efectivo (IVA 10.5% + IIBB 3.3% + Descuento 10%)
```
Precio:             $7000
(-) Descuento 10%:  $700  → Precio Neto: $6300
(-) Costo:          $3500
(-) IVA 10.5%:      $735  (sobre precio original)
(-) IIBB 3.3%:      $231  (sobre precio original)
= Ganancia:         $1834
MC Neto = $1834 / $6300 = 29.1%
```

#### Canal PedidosYa (IVA 10.5% + IIBB 3.3% + Comisión 22%)
```
Precio:             $8500
(-) Costo:          $3500
(-) IVA 10.5%:      $892.50
(-) IIBB 3.3%:      $280.50
(-) Com. PY 22%:    $1870
= Ganancia:         $1957
MC Neto = $1957 / $8500 = 23.0%
```

### 3.7 Clasificación de MC Neto (Colores)
```typescript
function getMCClass(mc: number): string {
    if (mc < 0) return 'danger';    // Rojo - Pérdida
    if (mc < 25) return 'danger';   // Rojo - Muy bajo
    if (mc < 35) return 'warning';  // Amarillo - Precaución
    return 'success';               // Verde - Bueno
}
```

---

## 4. API ENDPOINTS

### 4.1 Ingredientes (`/api/ingredientes.php`)

#### GET /api/ingredientes
Lista todos los ingredientes activos.

**Query params:**
- `categoria`: Filtrar por categoría
- `buscar`: Búsqueda por nombre
- `orden`: 'nombre' | 'precio' | 'fecha_desc' | 'antiguedad'
- `antiguedad`: Días sin actualizar (ej: '7', '30') o actualizados ('act_7', 'act_30')
- `fecha_desde`, `fecha_hasta`: Rango de fechas

**Response:**
```json
{
    "success": true,
    "data": [{
        "id": 1,
        "nombre": "Palta grande",
        "categoria": "Frutas",
        "unidad_id": 2,
        "unidad_nombre": "Kilogramos",
        "unidad_abrev": "kg",
        "contenido_envase": 17.00,
        "desperdicio": 10.00,
        "proveedor1": "Proveedor X",
        "precio1": 83000.00,
        "costo_unitario": 4882.3529,
        "costo_con_desperdicio": 5424.8366,
        "fecha_precio": "2026-02-01",
        "dias_desde_actualizacion": 8
    }],
    "categorias": ["Frutas", "Verduras", "Lacteos"],
    "total": 150
}
```

#### POST /api/ingredientes
Crear nuevo ingrediente.

**Body:**
```json
{
    "nombre": "Palta grande",
    "categoria": "Frutas",
    "unidad_id": 2,
    "contenido_envase": 17,
    "desperdicio": 10,
    "proveedor1": "Proveedor X",
    "precio1": 83000,
    "fecha_precio": "2026-02-01"
}
```

#### PUT /api/ingredientes?id={id}
Actualizar ingrediente. Recalcula automáticamente subrecetas y productos que lo usan.

#### DELETE /api/ingredientes?id={id}
Soft delete (activo = 0). Falla si está en uso.

---

### 4.2 Subrecetas (`/api/subrecetas.php`)

#### GET /api/subrecetas
```json
{
    "success": true,
    "data": [{
        "id": 1,
        "nombre": "Granola casera",
        "rendimiento_gramos": 500,
        "tipo_rendimiento": "gramos",
        "costo_total": 2500.00,
        "costo_por_100g": 500.00,
        "ingredientes": [{
            "ingrediente_id": 5,
            "ingrediente_nombre": "Avena",
            "cantidad": 200,
            "unidad": "g",
            "costo_con_desperdicio": 0.85,
            "abreviatura": "g"
        }]
    }]
}
```

#### POST /api/subrecetas
```json
{
    "nombre": "Granola casera",
    "rendimiento_gramos": 500,
    "tipo_rendimiento": "gramos",
    "ingredientes": [
        { "ingrediente_id": 5, "cantidad": 200, "unidad": "g" },
        { "ingrediente_id": 8, "cantidad": 100, "unidad": "g" }
    ]
}
```

---

### 4.3 Productos (`/api/productos.php`)

#### GET /api/productos
**Query params:**
- `categoria_id`: Filtrar por categoría
- `buscar`: Búsqueda por nombre
- `cambio_precio`: 'local' | 'pedidosya' | 'cualquiera'
- `dias_cambio`: Días para filtro de cambio de precio

**Response:**
```json
{
    "success": true,
    "data": [{
        "id": 1,
        "nombre": "Bowl Açaí Premium",
        "categoria_id": 1,
        "categoria_nombre": "Bowls",
        "categoria_icono": "🥣",
        "porciones": 1,
        "precio_publico": 7000.00,
        "precio_pedidosya": 8500.00,
        "costo_total": 3500.00,
        "es_borrador": 0,
        "ingredientes": [{
            "ingrediente_id": 1,
            "nombre": "Pulpa de açaí",
            "cantidad": 200,
            "unidad": "g",
            "unidad_display": "g",
            "costo_unitario": 8.50,
            "tipo": "ingrediente"
        }, {
            "subreceta_id": 1,
            "nombre": "Granola casera",
            "cantidad": 50,
            "unidad": "g",
            "unidad_display": "g",
            "costo_unitario": 5.00,
            "tipo": "subreceta"
        }],
        "rentabilidades": {
            "local_tarjeta": {
                "precio": 7000,
                "costo": 3500,
                "deducciones": 1176,
                "ganancia": 2324,
                "mc_neto": 33.2,
                "markup": 100
            },
            "local_efectivo": { ... },
            "pedidosya": { ... }
        }
    }]
}
```

#### POST /api/productos
```json
{
    "nombre": "Bowl Açaí Premium",
    "categoria_id": 1,
    "porciones": 1,
    "precio_publico": 7000,
    "precio_pedidosya": 8500,
    "es_borrador": 0,
    "ingredientes": [
        { "ingrediente_id": 1, "cantidad": 200, "unidad": "g" },
        { "subreceta_id": 1, "cantidad": 50, "unidad": "g" }
    ]
}
```

---

### 4.4 Conceptos/Canales (`/api/conceptos.php`)

#### GET /api/conceptos
Devuelve conceptos de costo y resumen por canal.

```json
{
    "success": true,
    "data": [{
        "id": 1,
        "nombre": "IVA",
        "tipo": "impuesto",
        "porcentaje": 10.50,
        "canales_ids": ["1", "2", "3"]
    }],
    "resumen_canales": {
        "tarjeta": {
            "nombre": "Local Tarjeta",
            "icono": "💳",
            "impuestos": 13.8,
            "comisiones": 3,
            "descuentos": 0,
            "total": 16.8,
            "conceptos": [
                { "id": 1, "nombre": "IVA", "tipo": "impuesto", "valor": 10.5 },
                { "id": 2, "nombre": "IIBB", "tipo": "impuesto", "valor": 3.3 },
                { "id": 3, "nombre": "Comisión Tarjeta", "tipo": "comision", "valor": 3 }
            ]
        },
        "efectivo": { ... },
        "pedidosya": { ... }
    }
}
```

---

### 4.5 Dashboard (`/api/dashboard.php`)

#### GET /api/dashboard
```json
{
    "success": true,
    "data": {
        "ingredientes": 150,
        "subrecetas": 25,
        "productos": 80,
        "categorias": 5,
        "config": {
            "iva": "10.5",
            "iibb": "3.3",
            "comision_tarjeta": "3"
        },
        "unidades": [
            { "id": 1, "nombre": "Gramos", "abreviatura": "g" }
        ],
        "categorias_ingredientes": [
            { "nombre": "Frutas" },
            { "nombre": "Verduras" }
        ],
        "productos_bajo_margen": [
            { "id": 5, "nombre": "Smoothie", "markup": 18.5 }
        ],
        "ingredientes_sin_proveedor": [
            { "id": 10, "nombre": "Miel" }
        ]
    }
}
```

---

### 4.6 Otros Endpoints

- **GET/POST/PUT/DELETE `/api/categorias.php`** - Categorías de productos
- **GET/POST/PUT/DELETE `/api/proveedores.php`** - Proveedores
- **GET/POST/PUT/DELETE `/api/ofertas.php`** - Ofertas y promociones
- **GET/PUT `/api/configuracion.php`** - Configuración general
- **GET `/api/canales.php`** - Canales de venta
- **GET `/api/unidades.php`** - Unidades de medida

---

## 5. MÓDULOS FRONTEND Y FUNCIONALIDADES

### 5.1 Dashboard
- Contadores: ingredientes, subrecetas, productos, categorías
- Alertas de productos con bajo margen (MC Neto < 25%)
- Lista de ingredientes sin proveedor asignado

### 5.2 Ingredientes
**Funcionalidades:**
- CRUD completo
- Filtros por categoría, antigüedad, fecha
- Ordenamiento múltiple
- Indicadores visuales de actualización:
  - ✓ Verde: actualizado en últimos 7 días
  - ⏰ Amarillo: 30-60 días sin actualizar
  - ⚠️ Rojo: +60 días sin actualizar
- Cálculo automático de costo con desperdicio
- Selector de IVA (0%, 10.5%, 21%) para ingresar precios sin IVA
- Visualización de precio por unidad con desperdicio incluido

### 5.3 Subrecetas
**Funcionalidades:**
- CRUD completo
- Dos tipos de rendimiento: gramos o porciones
- Buscador de ingredientes con autocompletado
- Cálculo automático de costo total y costo unitario
- Cantidades editables en línea

### 5.4 Productos
**Funcionalidades:**
- CRUD completo
- Tabs: Publicados / Borradores
- Buscador de ingredientes y subrecetas con autocompletado
- Cálculo en tiempo real de:
  - Costo total de receta
  - Costo por porción
  - MC Neto por cada canal
  - Desglose detallado de deducciones
- Soporte para múltiples porciones
- Búsqueda normalizada (açaí = acai)

### 5.5 Rentabilidades
**Funcionalidades:**
- Vista comparativa de todos los productos
- MC Neto por los 3 canales en paralelo
- Filtros por categoría, canal, cambio de precio
- Promedios de MC Neto por canal
- Click en producto abre modal de edición
- Indicadores de cambio de precio (📈📉)

### 5.6 Ofertas
**Funcionalidades:**
- Tipos: descuento %, descuento $, 2x1, 3x2, precio especial
- Fechas de inicio/fin
- Estados: activa, pausada, programada, vencida
- Selección múltiple de productos
- Simulador de MC Neto con la oferta aplicada

### 5.7 Configuración
**Funcionalidades:**
- Gestión dinámica de conceptos de costo
- Asignación de conceptos a canales
- Override de porcentajes por canal
- Visualización de resumen por canal
- Configuración de alertas de bajo margen

### 5.8 Proveedores
- CRUD simple
- Contador de ingredientes por proveedor

### 5.9 Categorías
- Categorías de productos con icono y color
- Ordenamiento manual

---

## 6. ESTADOS DE LA APLICACIÓN (ZUSTAND)

```typescript
// stores/ingredientesStore.ts
interface IngredientesState {
    ingredientes: Ingrediente[];
    loading: boolean;
    filtros: {
        categoria: string;
        buscar: string;
        orden: string;
        antiguedad: string;
        fechaDesde: string;
        fechaHasta: string;
    };
    fetchIngredientes: () => Promise<void>;
    createIngrediente: (data: CreateIngredienteDTO) => Promise<void>;
    updateIngrediente: (id: number, data: UpdateIngredienteDTO) => Promise<void>;
    deleteIngrediente: (id: number) => Promise<void>;
    setFiltro: (key: string, value: string) => void;
}

// stores/productosStore.ts
interface ProductosState {
    productos: Producto[];
    publicados: Producto[];
    borradores: Producto[];
    tabActivo: 'publicados' | 'borradores';
    loading: boolean;
    categorias: Categoria[];
    fetchProductos: () => Promise<void>;
    // ...
}

// stores/configStore.ts
interface ConfigState {
    config: Record<string, string>;
    canales: Canal[];
    conceptos: Concepto[];
    resumenCanales: ResumenCanales;
    fetchConfig: () => Promise<void>;
    updateConcepto: (id: number, data: Partial<Concepto>) => Promise<void>;
}
```

---

## 7. TIPOS TYPESCRIPT

```typescript
// types/ingrediente.ts
interface Ingrediente {
    id: number;
    nombre: string;
    categoria: string | null;
    unidad_id: number;
    unidad_nombre: string;
    unidad_abrev: string;
    contenido_envase: number;
    desperdicio: number;
    proveedor1: string | null;
    precio1: number;
    costo_unitario: number;
    costo_con_desperdicio: number;
    fecha_precio: string | null;
    dias_desde_actualizacion: number | null;
    activo: boolean;
}

// types/subreceta.ts
interface Subreceta {
    id: number;
    nombre: string;
    rendimiento_gramos: number;
    tipo_rendimiento: 'gramos' | 'porciones';
    costo_total: number;
    costo_por_100g: number;
    ingredientes: SubrecetaIngrediente[];
}

interface SubrecetaIngrediente {
    id: number;
    ingrediente_id: number;
    ingrediente_nombre: string;
    cantidad: number;
    unidad: string;
    costo_con_desperdicio: number;
    abreviatura: string;
}

// types/producto.ts
interface Producto {
    id: number;
    nombre: string;
    categoria_id: number | null;
    categoria_nombre: string | null;
    categoria_icono: string | null;
    porciones: number;
    precio_publico: number;
    precio_pedidosya: number;
    costo_total: number;
    es_borrador: boolean;
    ingredientes: ProductoIngrediente[];
    rentabilidades: Rentabilidades;
}

interface ProductoIngrediente {
    id: number;
    producto_id: number;
    ingrediente_id: number | null;
    subreceta_id: number | null;
    nombre: string;
    cantidad: number;
    unidad: string;
    unidad_display: string;
    costo_unitario: number;
    tipo: 'ingrediente' | 'subreceta';
}

interface Rentabilidades {
    local_tarjeta: RentabilidadCanal;
    local_efectivo: RentabilidadCanal;
    pedidosya: RentabilidadCanal;
}

interface RentabilidadCanal {
    precio: number;
    costo: number;
    deducciones: number;
    ganancia: number;
    mc_neto: number;
    markup: number;
}

// types/concepto.ts
interface Concepto {
    id: number;
    nombre: string;
    tipo: 'impuesto' | 'comision' | 'descuento';
    porcentaje: number;
    descripcion: string | null;
    es_resta: boolean;
    canales_ids: number[];
}

interface ResumenCanal {
    nombre: string;
    icono: string;
    impuestos: number;
    comisiones: number;
    descuentos: number;
    total: number;
    conceptos: { id: number; nombre: string; tipo: string; valor: number }[];
}

type ResumenCanales = Record<'tarjeta' | 'efectivo' | 'pedidosya', ResumenCanal>;
```

---

## 8. ESTRUCTURA DE CARPETAS SUGERIDA (REACT)

```
src/
├── api/
│   ├── axios.ts              # Configuración de Axios
│   ├── ingredientes.ts       # API de ingredientes
│   ├── subrecetas.ts
│   ├── productos.ts
│   ├── conceptos.ts
│   └── ...
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   ├── Toast.tsx
│   │   ├── Autocomplete.tsx
│   │   └── LoadingSpinner.tsx
│   ├── ingredientes/
│   │   ├── IngredientesTable.tsx
│   │   ├── IngredienteModal.tsx
│   │   ├── IngredienteFilters.tsx
│   │   └── PrecioPorUnidad.tsx
│   ├── subrecetas/
│   │   ├── SubrecetasTable.tsx
│   │   ├── SubrecetaModal.tsx
│   │   └── IngredientesList.tsx
│   ├── productos/
│   │   ├── ProductosTable.tsx
│   │   ├── ProductoModal.tsx
│   │   ├── ProductoTabs.tsx
│   │   ├── DesgloseRentabilidad.tsx
│   │   └── BuscadorIngredientes.tsx
│   ├── rentabilidades/
│   │   ├── RentabilidadesTable.tsx
│   │   ├── ResumenCanales.tsx
│   │   └── FiltrosRentabilidad.tsx
│   ├── configuracion/
│   │   ├── ConceptosTable.tsx
│   │   ├── ConceptoModal.tsx
│   │   └── ResumenCanalesConfig.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── MainContent.tsx
├── hooks/
│   ├── useIngredientes.ts
│   ├── useSubrecetas.ts
│   ├── useProductos.ts
│   ├── useMCNeto.ts
│   └── useDebounce.ts
├── stores/
│   ├── ingredientesStore.ts
│   ├── subrecetasStore.ts
│   ├── productosStore.ts
│   ├── configStore.ts
│   └── uiStore.ts
├── pages/
│   ├── Dashboard.tsx
│   ├── Ingredientes.tsx
│   ├── Subrecetas.tsx
│   ├── Productos.tsx
│   ├── Rentabilidades.tsx
│   ├── Ofertas.tsx
│   ├── Categorias.tsx
│   ├── Proveedores.tsx
│   └── Configuracion.tsx
├── types/
│   ├── ingrediente.ts
│   ├── subreceta.ts
│   ├── producto.ts
│   ├── concepto.ts
│   └── index.ts
├── utils/
│   ├── formatters.ts         # formatMoney, formatNumber
│   ├── calculators.ts        # calcularMCNeto, calcularCostoConDesperdicio
│   ├── validators.ts
│   └── normalizers.ts        # normalizeText para búsquedas
├── styles/
│   └── globals.css           # Tailwind imports
├── App.tsx
└── main.tsx
```

---

## 9. FUNCIONES UTILITARIAS CRÍTICAS

```typescript
// utils/formatters.ts
export function formatMoney(num: number | null): string {
    if (num === null || num === undefined || isNaN(num)) return '$0,00';
    return '$' + num.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function formatNumber(num: number | null, decimals = 2): string {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toLocaleString('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

// utils/calculators.ts
export function calcularCostoConDesperdicio(
    precio: number,
    contenido: number,
    desperdicio: number
): number {
    const costoUnitario = precio / contenido;
    if (desperdicio > 0 && desperdicio < 100) {
        return costoUnitario / (1 - desperdicio / 100);
    }
    return costoUnitario;
}

export function calcularMCNeto(
    precio: number,
    costo: number,
    resumenCanal: ResumenCanal
): { ganancia: number; mc: number; deducciones: DetalleDeduccion[] } {
    let totalDeducciones = 0;
    let descuentoMonto = 0;
    const deducciones: DetalleDeduccion[] = [];

    for (const concepto of resumenCanal.conceptos) {
        const monto = precio * (concepto.valor / 100);

        if (concepto.tipo === 'descuento') {
            descuentoMonto = monto;
        }

        totalDeducciones += monto;
        deducciones.push({ nombre: concepto.nombre, monto, porcentaje: concepto.valor });
    }

    const precioNeto = precio - descuentoMonto;
    const ganancia = precio - costo - totalDeducciones;
    const mc = precioNeto > 0 ? (ganancia / precioNeto) * 100 : 0;

    return { ganancia, mc, deducciones };
}

// utils/normalizers.ts
export function normalizarTexto(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Quitar acentos
        .replace(/ç/g, 'c')
        .replace(/ñ/g, 'n');
}
```

---

## 10. CONSIDERACIONES ESPECIALES

### 10.1 Recálculo en Cascada
Cuando se actualiza un ingrediente:
1. Recalcular todas las subrecetas que lo usan
2. Recalcular todos los productos que usan el ingrediente directamente
3. Recalcular todos los productos que usan las subrecetas afectadas

### 10.2 Soft Delete
Todas las entidades principales usan `activo = 0` para eliminar, no DELETE físico.

### 10.3 Unidades de Medida
Cada ingrediente tiene su propia unidad. Al agregar a producto/subreceta, se respeta esa unidad:
- Si el ingrediente es en kg, se muestra "X kg" (no siempre gramos)
- Las subrecetas con tipo_rendimiento='porciones' usan "porc" como unidad

### 10.4 Precios de Venta
- `precio_publico`: Precio para venta local (tarjeta y efectivo)
- `precio_pedidosya`: Precio para delivery (puede ser diferente)

### 10.5 Conceptos por Canal
La configuración de impuestos/comisiones es dinámica y puede variar por canal.

### 10.6 Validaciones
- Contenido envase > 0
- Desperdicio 0-99%
- Precios >= 0
- Al menos 1 ingrediente por producto/subreceta
- Porciones >= 1

---

## 11. CONEXIÓN A BASE DE DATOS

```typescript
// Para el backend en Node.js/Express
// Se mantiene la misma base de datos MySQL en Hostinger

// Configuración de conexión:
const dbConfig = {
    host: 'localhost',  // o IP del servidor Hostinger
    database: 'u482097276_coffitcost',
    user: 'u482097276_lucaslor',
    password: '********',  // Usar variable de entorno
    charset: 'utf8mb4'
};
```

---

## 12. VARIABLES DE ENTORNO

```env
# .env.local (Frontend)
VITE_API_URL=https://tudominio.com/api

# .env (Backend)
DB_HOST=localhost
DB_NAME=u482097276_coffitcost
DB_USER=u482097276_lucaslor
DB_PASSWORD=*********
PORT=3001
NODE_ENV=production
```

---

## 13. COLORES Y DISEÑO

```css
/* Paleta principal */
--primary: #E07B39;          /* Naranja - Color principal */
--primary-dark: #C66A2E;
--success: #28a745;          /* Verde */
--warning: #ffc107;          /* Amarillo */
--danger: #dc3545;           /* Rojo */

/* MC Neto colores */
--mc-danger: #dc3545;        /* < 25% */
--mc-warning: #f57c00;       /* 25-35% */
--mc-success: #2e7d32;       /* > 35% */

/* Fondo */
--bg-light: #f8f9fa;
--bg-card: #ffffff;

/* Texto */
--text-primary: #333333;
--text-muted: #666666;
```

---

## 14. CREDENCIALES DE LA BASE DE DATOS (ACTUAL)

**IMPORTANTE**: Cambiar la contraseña en producción.

```
Host: localhost (Hostinger)
Database: u482097276_coffitcost
User: u482097276_lucaslor
Password: [Configurar en variable de entorno]
```

---

Este documento contiene toda la información necesaria para migrar CoffitCost al nuevo stack tecnológico manteniendo la misma base de datos y lógica de negocio.
