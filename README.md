# CoffitCost

**Sistema de Gestion de Costos, Recetas y Rentabilidad para Gastronomia**

CoffitCost es una aplicacion web fullstack disenada para gestionar costos de ingredientes, composicion de recetas (subrecetas y productos), analisis de rentabilidad por canal de venta, y preparaciones para cocina. Incluye una API externa para integracion con sistemas de terceros.

---

## Tabla de Contenidos

- [Arquitectura General](#arquitectura-general)
- [Stack Tecnologico](#stack-tecnologico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Base de Datos](#base-de-datos)
  - [Diagrama de Tablas](#diagrama-de-tablas)
  - [Detalle de Tablas](#detalle-de-tablas)
  - [Datos Semilla](#datos-semilla)
- [Backend (API REST)](#backend-api-rest)
  - [Configuracion](#configuracion-backend)
  - [Middleware](#middleware)
  - [Rutas de la API](#rutas-de-la-api)
  - [Utilidades y Logica de Negocio](#utilidades-y-logica-de-negocio)
- [Frontend (SPA)](#frontend-spa)
  - [Configuracion](#configuracion-frontend)
  - [Paginas](#paginas)
  - [Componentes Comunes](#componentes-comunes)
  - [State Management](#state-management)
  - [API Client](#api-client)
  - [Utilidades Frontend](#utilidades-frontend)
- [Formulas y Calculos](#formulas-y-calculos)
  - [Costo Unitario](#costo-unitario)
  - [Costo con Desperdicio](#costo-con-desperdicio)
  - [MC Neto (Margen de Contribucion Neto)](#mc-neto-margen-de-contribucion-neto)
  - [Recalculacion en Cascada](#recalculacion-en-cascada)
- [API Externa de Costos](#api-externa-de-costos)
  - [Endpoint /api/costo-producto](#endpoint-apicosto-producto)
  - [Integracion con App PHP (RentCoffit)](#integracion-con-app-php-rentcoffit)
  - [Clase CoffitCostAPI (PHP)](#clase-coffitcostapi-php)
  - [Endpoint actualizar_costos.php](#endpoint-actualizar_costosphp)
- [Canales de Venta y Conceptos](#canales-de-venta-y-conceptos)
- [Deployment](#deployment)
  - [Backend en Hostinger](#backend-en-hostinger)
  - [Frontend en Vercel](#frontend-en-vercel)
  - [Base de Datos en Hostinger](#base-de-datos-en-hostinger)
- [Variables de Entorno](#variables-de-entorno)
- [Comandos Utiles](#comandos-utiles)

---

## Arquitectura General

```
                   +---------------------------+
                   |      Vercel (Frontend)     |
                   |   coffitcost.vercel.app    |
                   |  React 18 + TS + Tailwind  |
                   +------------+--------------+
                                |
                          HTTPS / REST
                                |
                   +------------v--------------+
                   |    Hostinger (Backend)     |
                   | coffitcost.saboryaroma.com |
                   |   Node.js + Express 5     |
                   +------------+--------------+
                                |
                          MySQL (local)
                                |
                   +------------v--------------+
                   |    Hostinger (MySQL)       |
                   |  u482097276_cofcost        |
                   |     15 tablas              |
                   +---------------------------+

    +---------------------------+
    |   App PHP Externa         |
    | saboryaroma.com/rentcoffit|
    |   (Consume API costos)    |
    +------------+--------------+
                 |
         curl / server-to-server
                 |
                 v
    GET /api/costo-producto?nombre=...
```

---

## Stack Tecnologico

### Backend
| Tecnologia | Version | Uso |
|---|---|---|
| Node.js | 18+ | Runtime del servidor |
| Express | 5.2 | Framework HTTP |
| MySQL2 | 3.16 | Driver de base de datos (promise-based) |
| dotenv | 17.2 | Variables de entorno |
| cors | 2.8 | Cross-Origin Resource Sharing |
| morgan | 1.10 | HTTP request logger (dev only) |
| nodemon | 3.1 | Auto-restart en desarrollo |

### Frontend
| Tecnologia | Version | Uso |
|---|---|---|
| React | 19.2 | UI Library |
| TypeScript | 5.x | Tipado estatico |
| Vite | 7.3 | Build tool y dev server |
| Tailwind CSS | 4.1 | Framework de estilos utility-first |
| TanStack React Query | 5.90 | Server state management |
| Zustand | 5.0 | Client state management |
| Axios | 1.x | HTTP client |
| React Router DOM | 7.13 | Routing SPA |
| Lucide React | - | Iconos SVG |
| React Hot Toast | - | Notificaciones |
| Recharts | - | Graficos (opcional) |

### Base de Datos
| Tecnologia | Uso |
|---|---|
| MySQL 8 | Base de datos relacional (Hostinger) |
| InnoDB | Motor de almacenamiento |
| utf8mb4 | Character set (soporte emojis) |

### Integracion Externa
| Tecnologia | Uso |
|---|---|
| PHP 8 | App RentCoffit (consumidora de API) |
| cURL | Llamadas HTTP server-to-server |

---

## Estructura del Proyecto

```
coffitcostnew/
|
|-- backend/
|   |-- .env                          # Variables de entorno
|   |-- package.json                  # Dependencias y scripts
|   |-- database/
|   |   |-- schema.sql                # DDL - 15 tablas
|   |   |-- seed.sql                  # Datos iniciales
|   |   |-- migrate.js                # Script de migracion
|   |-- src/
|       |-- index.js                  # Entry point del servidor
|       |-- config/
|       |   |-- db.js                 # Pool de conexiones MySQL
|       |-- middleware/
|       |   |-- asyncHandler.js       # Wrapper async para rutas
|       |   |-- errorHandler.js       # Middleware global de errores
|       |-- routes/
|       |   |-- ingredientes.js       # CRUD ingredientes
|       |   |-- subrecetas.js         # CRUD subrecetas
|       |   |-- productos.js          # CRUD productos + rentabilidad
|       |   |-- ofertas.js            # CRUD ofertas/promociones
|       |   |-- preparaciones.js      # Instrucciones de cocina
|       |   |-- costoProducto.js      # API externa de costos
|       |   |-- dashboard.js          # Metricas y alertas
|       |   |-- unidades.js           # Unidades de medida
|       |   |-- configuracion.js      # Config clave-valor
|       |   |-- proveedores.js        # CRUD proveedores
|       |   |-- categorias.js         # Categorias (ingredientes + productos)
|       |   |-- canales.js            # Canales de venta
|       |   |-- conceptos.js          # Conceptos de costo (impuestos, comisiones)
|       |-- utils/
|           |-- response.js           # Helpers success()/error()
|           |-- recalculate.js        # Recalculo en cascada de costos
|           |-- mcNeto.js             # Calculo de MC Neto por canal
|
|-- frontend/
|   |-- .env.production               # URL de la API en produccion
|   |-- package.json                  # Dependencias y scripts
|   |-- vite.config.ts                # Configuracion de Vite
|   |-- tailwind.config.ts            # Configuracion de Tailwind
|   |-- src/
|       |-- App.tsx                   # Router principal
|       |-- main.tsx                  # Entry point
|       |-- api/
|       |   |-- client.ts             # Instancia Axios configurada
|       |   |-- ingredientes.ts       # API calls ingredientes
|       |   |-- productos.ts          # API calls productos
|       |   |-- subrecetas.ts         # API calls subrecetas
|       |   |-- ofertas.ts            # API calls ofertas
|       |   |-- preparaciones.ts      # API calls preparaciones
|       |   |-- (unidades, config, proveedores, categorias, canales, conceptos, dashboard).ts
|       |-- pages/
|       |   |-- Dashboard.tsx         # Panel principal con metricas
|       |   |-- Ingredientes.tsx      # Gestion de ingredientes
|       |   |-- Subrecetas.tsx        # Gestion de subrecetas
|       |   |-- Productos.tsx         # Gestion de productos + rentabilidad
|       |   |-- Ofertas.tsx           # Gestion de ofertas
|       |   |-- Preparaciones.tsx     # Instrucciones de cocina
|       |   |-- Rentabilidades.tsx    # Analisis de rentabilidad
|       |   |-- Categorias.tsx        # Gestion de categorias
|       |   |-- Proveedores.tsx       # Gestion de proveedores
|       |   |-- Configuracion.tsx     # Configuracion del sistema
|       |-- components/
|       |   |-- layout/
|       |   |   |-- Sidebar.tsx       # Menu lateral responsive
|       |   |   |-- Header.tsx        # Barra superior
|       |   |-- common/
|       |       |-- Button.tsx
|       |       |-- Modal.tsx
|       |       |-- NumericInput.tsx   # Input numerico sin leading zeros
|       |       |-- MCBadge.tsx        # Badge de MC Neto coloreado
|       |       |-- SearchInput.tsx
|       |       |-- ConfirmDialog.tsx
|       |       |-- LoadingSpinner.tsx
|       |       |-- EmptyState.tsx
|       |-- stores/
|       |   |-- ingredientesStore.ts  # Zustand: filtros + modal
|       |   |-- productosStore.ts     # Zustand: tabs + filtros + modal
|       |   |-- uiStore.ts           # Zustand: sidebar open/close
|       |-- utils/
|       |   |-- formatters.ts        # formatMoney, formatDate, formatPercent
|       |   |-- calculators.ts       # MC Neto, costo con desperdicio
|       |   |-- normalizers.ts       # Normalizacion de texto (acentos)
|       |-- types/
|       |   |-- index.ts             # Barrel exports de tipos
|       |   |-- (common, ingrediente, subreceta, producto, concepto, oferta).ts
|       |-- hooks/
|           |-- useDebounce.ts       # Hook de debounce para busquedas
|
|-- coffitcost.php                    # Clase PHP para consumir API de costos
|-- actualizar_costos.php             # Endpoint PHP de sincronizacion masiva
```

---

## Base de Datos

### Diagrama de Tablas

```
unidades ─────────────┐
                      │ FK: unidad_id
                      v
categorias_ingredientes    ingredientes ◄──── subreceta_ingredientes ───► subrecetas
                                │                                            │
                                │                                            │
                                ▼                                            ▼
                           producto_ingredientes ◄──────────────────── producto_ingredientes
                                │                                     (subreceta_id)
                                ▼
categorias_productos ───► productos ◄──── oferta_productos ───► ofertas
                                │
                                │ (preparacion, coccion, tener_en_cuenta = TEXT)
                                ▼
                          canales_venta ◄── conceptos_canales ──► conceptos_costo
                                                (many-to-many)

configuracion (clave-valor independiente)
proveedores (referenciados por nombre en ingredientes.proveedor1/proveedor2)
```

### Detalle de Tablas

#### 1. `unidades` - Unidades de Medida
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(50) NOT NULL | Nombre completo (ej: "Kilogramos") |
| abreviatura | VARCHAR(10) NOT NULL | Abreviatura (ej: "kg") |
| activo | TINYINT(1) DEFAULT 1 | Soft delete flag |

#### 2. `configuracion` - Configuracion del Sistema
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| clave | VARCHAR(100) NOT NULL UNIQUE | Clave de configuracion |
| valor | TEXT | Valor de la configuracion |
| descripcion | VARCHAR(255) | Descripcion legible |

#### 3. `proveedores` - Proveedores
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(150) NOT NULL | Nombre del proveedor |
| telefono | VARCHAR(50) | Telefono |
| email | VARCHAR(100) | Email |
| direccion | TEXT | Direccion |
| notas | TEXT | Notas adicionales |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |
| created_at | TIMESTAMP | Fecha de creacion |

#### 4. `categorias_ingredientes` - Categorias de Ingredientes
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(100) NOT NULL | Nombre de la categoria |
| color | VARCHAR(20) DEFAULT '#666666' | Color para UI |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 5. `categorias_productos` - Categorias de Productos
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(100) NOT NULL | Nombre |
| icono | VARCHAR(10) DEFAULT '📦' | Emoji para UI |
| color | VARCHAR(20) DEFAULT '#666666' | Color |
| orden | INT DEFAULT 0 | Orden de visualizacion |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 6. `canales_venta` - Canales de Venta
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| codigo | VARCHAR(50) NOT NULL UNIQUE | Codigo interno (tarjeta, efectivo, pedidosya) |
| nombre | VARCHAR(100) NOT NULL | Nombre visible |
| icono | VARCHAR(10) | Emoji |
| color | VARCHAR(20) | Color |
| orden | INT DEFAULT 0 | Orden |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 7. `conceptos_costo` - Conceptos de Costo
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(100) NOT NULL | Nombre (ej: "IVA", "Comision Tarjeta") |
| tipo | VARCHAR(20) NOT NULL | Tipo: `impuesto`, `comision`, `descuento` |
| porcentaje | DECIMAL(6,2) NOT NULL DEFAULT 0 | Porcentaje base |
| descripcion | TEXT | Descripcion |
| es_resta | TINYINT(1) DEFAULT 1 | Si resta del margen |
| orden | INT DEFAULT 0 | Orden |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 8. `ingredientes` - Ingredientes
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(150) NOT NULL | Nombre del ingrediente |
| categoria | VARCHAR(100) | Categoria (texto libre) |
| unidad_id | INT FK → unidades | Unidad de medida |
| contenido_envase | DECIMAL(10,2) DEFAULT 1 | Contenido del envase en la unidad |
| desperdicio | DECIMAL(5,2) DEFAULT 0 | % de desperdicio |
| proveedor1 | VARCHAR(100) | Nombre proveedor principal |
| precio1 | DECIMAL(12,2) DEFAULT 0 | Precio envase proveedor 1 |
| proveedor2 | VARCHAR(100) | Nombre proveedor secundario |
| precio2 | DECIMAL(12,2) DEFAULT 0 | Precio envase proveedor 2 |
| costo_unitario | DECIMAL(12,4) DEFAULT 0 | **Calculado**: precio1 / contenido_envase |
| costo_con_desperdicio | DECIMAL(12,4) DEFAULT 0 | **Calculado**: costo_unitario / (1 - desperdicio/100) |
| fecha_precio | DATE | Fecha del ultimo cambio de precio |
| notas | TEXT | Notas |
| calorias-fibra | DECIMAL(8,2) | Informacion nutricional (5 campos) |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 9. `subrecetas` - Subrecetas
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(150) NOT NULL | Nombre |
| rendimiento_gramos | DECIMAL(10,2) DEFAULT 100 | Rendimiento total |
| tipo_rendimiento | VARCHAR(20) DEFAULT 'gramos' | `gramos` o `porciones` |
| costo_total | DECIMAL(12,2) DEFAULT 0 | **Calculado**: suma de costos de ingredientes |
| costo_por_100g | DECIMAL(12,4) DEFAULT 0 | **Calculado**: (costo_total / rendimiento) * 100 |
| notas | TEXT | Notas / instrucciones de preparacion |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 10. `subreceta_ingredientes` - Pivot: Subreceta ↔ Ingrediente
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| subreceta_id | INT FK → subrecetas (CASCADE) | Subreceta padre |
| ingrediente_id | INT FK → ingredientes (CASCADE) | Ingrediente |
| cantidad | DECIMAL(10,4) NOT NULL DEFAULT 0 | Cantidad utilizada |
| unidad | VARCHAR(20) DEFAULT 'g' | Unidad de la cantidad |

#### 11. `productos` - Productos Finales
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(150) NOT NULL | Nombre del producto |
| categoria_id | INT FK → categorias_productos (SET NULL) | Categoria |
| porciones | INT DEFAULT 1 | Cantidad de porciones que rinde |
| precio_publico | DECIMAL(12,2) DEFAULT 0 | Precio local (tarjeta/efectivo) |
| precio_pedidosya | DECIMAL(12,2) DEFAULT 0 | Precio PedidosYa |
| costo_total | DECIMAL(12,2) DEFAULT 0 | **Calculado**: suma costos receta |
| es_borrador | TINYINT(1) DEFAULT 0 | Flag borrador |
| notas | TEXT | Notas |
| preparacion | TEXT | Pasos de preparacion (\\n separados) |
| coccion | TEXT | Instrucciones de coccion (\\n separados) |
| tener_en_cuenta | TEXT | Notas importantes (\\n separados) |
| precio_anterior_local | DECIMAL(12,2) | Historial de precio anterior |
| precio_anterior_pedidosya | DECIMAL(12,2) | Historial de precio anterior PY |
| fecha_cambio_precio | DATETIME | Fecha del ultimo cambio de precio |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 12. `producto_ingredientes` - Pivot: Producto ↔ Ingrediente/Subreceta
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| producto_id | INT FK → productos (CASCADE) | Producto padre |
| ingrediente_id | INT FK → ingredientes (CASCADE) | Ingrediente (nullable) |
| subreceta_id | INT FK → subrecetas (CASCADE) | Subreceta (nullable) |
| cantidad | DECIMAL(10,4) NOT NULL DEFAULT 0 | Cantidad |
| unidad | VARCHAR(20) DEFAULT 'g' | Unidad |

> **Nota**: Cada fila tiene `ingrediente_id` **o** `subreceta_id`, nunca ambos.

#### 13. `ofertas` - Ofertas y Promociones
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| nombre | VARCHAR(150) | Nombre de la oferta |
| tipo | VARCHAR(50) | `descuento_porcentaje`, `descuento_fijo`, `2x1`, `3x2`, `precio_especial` |
| valor | DECIMAL(10,2) DEFAULT 0 | Valor del descuento |
| descripcion | TEXT | Descripcion |
| fecha_inicio | DATE | Inicio de vigencia |
| fecha_fin | DATE | Fin de vigencia |
| estado | VARCHAR(20) DEFAULT 'activa' | `activa`, `pausada`, `programada`, `vencida` |
| activo | TINYINT(1) DEFAULT 1 | Soft delete |

#### 14. `oferta_productos` - Pivot: Oferta ↔ Producto
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| oferta_id | INT FK → ofertas (CASCADE) | Oferta |
| producto_id | INT FK → productos (CASCADE) | Producto |

#### 15. `conceptos_canales` - Pivot: Concepto ↔ Canal (Many-to-Many)
| Columna | Tipo | Descripcion |
|---|---|---|
| id | INT PK AUTO_INCREMENT | ID |
| concepto_id | INT FK → conceptos_costo (CASCADE) | Concepto |
| canal_id | INT FK → canales_venta (CASCADE) | Canal |
| porcentaje_override | DECIMAL(6,2) DEFAULT NULL | Override del % para este canal |
| activo | TINYINT(1) DEFAULT 1 | Activo |
| | UNIQUE KEY | (concepto_id, canal_id) |

### Datos Semilla

**Unidades (6)**:
`g` (Gramos), `kg` (Kilogramos), `ml` (Mililitros), `L` (Litros), `u` (Unidad), `doc` (Docena)

**Configuracion (7 claves)**:
| Clave | Valor | Descripcion |
|---|---|---|
| iva | 10.5 | IVA general |
| iibb | 3.3 | Ingresos Brutos |
| comision_tarjeta | 3 | Comision tarjeta |
| descuento_efectivo | 10 | Descuento efectivo |
| comision_pedidosya | 22 | Comision PedidosYa |
| moneda | ARS | Moneda |
| nombre_negocio | CoffitCost | Nombre |

**Canales de Venta (3)**:
| Codigo | Nombre | Icono |
|---|---|---|
| tarjeta | Local Tarjeta | 💳 |
| efectivo | Local Efectivo | 💵 |
| pedidosya | PedidosYa | 🛵 |

**Conceptos de Costo (5)**:
| Concepto | Tipo | % | Canales |
|---|---|---|---|
| IVA | impuesto | 10.50% | tarjeta, efectivo, pedidosya |
| IIBB | impuesto | 3.30% | tarjeta, efectivo, pedidosya |
| Comision Tarjeta | comision | 3.00% | tarjeta |
| Comision PedidosYa | comision | 22.00% | pedidosya |
| Descuento Efectivo | descuento | 10.00% | efectivo |

---

## Backend (API REST)

### Configuracion Backend

**Entry point**: `backend/src/index.js`

```javascript
// CORS multi-origen
const allowedOrigins = process.env.CORS_ORIGIN.split(',').map(s => s.trim());
// Origenes permitidos: coffitcost.vercel.app, saboryaroma.com
// Requests sin origin (curl, server-to-server) siempre permitidos
```

**Pool de conexiones** (`config/db.js`):
- MySQL2 con promise API
- Pool size: 10 conexiones
- Charset: utf8mb4
- Connection limit configurado sin cola

### Middleware

| Middleware | Funcion |
|---|---|
| `asyncHandler(fn)` | Wraps async route handlers, atrapa errores y los pasa a `next()` |
| `errorHandler(err, req, res, next)` | Middleware global de errores. Devuelve JSON `{ success: false, message }` |
| `cors` | Multi-origen configurable por env |
| `morgan` | Logger HTTP (solo en desarrollo) |

### Rutas de la API

Base URL: `https://coffitcost.saboryaroma.com/api`

#### Ingredientes `/api/ingredientes`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar ingredientes con filtros |
| POST | `/` | Crear ingrediente |
| PUT | `/:id` | Actualizar ingrediente (cascada costos) |
| DELETE | `/:id` | Soft delete (si no tiene dependencias) |

**Filtros GET**:
| Parametro | Tipo | Descripcion |
|---|---|---|
| categoria | string | Filtrar por categoria |
| buscar | string | Buscar por nombre (LIKE) |
| orden | string | `nombre`, `precio`, `fecha_desc`, `antiguedad` |
| antiguedad | number | Dias desde ultimo precio |
| fecha_desde | date | Fecha minima de precio |
| fecha_hasta | date | Fecha maxima de precio |

**Body POST/PUT**:
```json
{
  "nombre": "Leche Entera",
  "categoria": "Lacteos",
  "unidad_id": 4,
  "contenido_envase": 1,
  "desperdicio": 5,
  "proveedor1": "Proveedor A",
  "precio1": 1200,
  "proveedor2": "Proveedor B",
  "precio2": 1150,
  "fecha_precio": "2026-02-14",
  "notas": "Marca preferida: La Serenisima"
}
```

**Response GET**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre": "Leche Entera",
      "categoria": "Lacteos",
      "unidad_id": 4,
      "unidad_nombre": "Litros",
      "unidad_abrev": "L",
      "contenido_envase": 1,
      "desperdicio": 5,
      "precio1": 1200,
      "costo_unitario": 1200,
      "costo_con_desperdicio": 1263.16,
      "fecha_precio": "2026-02-14",
      "dias_precio": 0
    }
  ],
  "categorias": ["Lacteos", "Harinas", "Frutas"]
}
```

**Logica de negocio**:
- Al crear/actualizar: calcula `costo_unitario = precio1 / contenido_envase`
- Calcula `costo_con_desperdicio = costo_unitario / (1 - desperdicio / 100)`
- Al actualizar: cascada automatica a subrecetas y productos dependientes
- Delete: bloqueado si se usa en subrecetas o productos

---

#### Subrecetas `/api/subrecetas`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar todas con ingredientes |
| GET | `/:id` | Detalle con ingredientes |
| POST | `/` | Crear subreceta |
| PUT | `/:id` | Actualizar (cascada a productos) |
| DELETE | `/:id` | Soft delete (si no se usa en productos) |

**Body POST/PUT**:
```json
{
  "nombre": "Crema Pastelera",
  "rendimiento_gramos": 500,
  "tipo_rendimiento": "gramos",
  "notas": "Preparar el dia anterior",
  "ingredientes": [
    { "ingrediente_id": 1, "cantidad": 500, "unidad": "ml" },
    { "ingrediente_id": 5, "cantidad": 200, "unidad": "g" }
  ]
}
```

**Logica de negocio**:
- `costo_total` = suma de (cantidad * costo_con_desperdicio) por ingrediente
- `costo_por_100g` = (costo_total / rendimiento_gramos) * 100
- Al actualizar: cascada automatica a productos que usan esta subreceta

---

#### Productos `/api/productos`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar con rentabilidades por canal |
| GET | `/:id` | Detalle completo |
| POST | `/` | Crear producto |
| PUT | `/:id` | Actualizar (historial de precios) |
| DELETE | `/:id` | Soft delete |

**Filtros GET**:
| Parametro | Tipo | Descripcion |
|---|---|---|
| es_borrador | 0/1 | Publicados o borradores |
| categoria_id | number | Filtrar por categoria |
| buscar | string | Buscar por nombre |
| cambio_precio | string | `local`, `pedidosya`, `cualquiera` |
| dias_cambio | number | Dias desde cambio de precio |

**Body POST/PUT**:
```json
{
  "nombre": "Cafe Latte",
  "categoria_id": 2,
  "porciones": 1,
  "precio_publico": 3500,
  "precio_pedidosya": 4200,
  "es_borrador": 0,
  "notas": "",
  "ingredientes": [
    { "ingrediente_id": 1, "cantidad": 200, "unidad": "ml" },
    { "subreceta_id": 3, "cantidad": 50, "unidad": "g" }
  ]
}
```

**Response GET** (por producto):
```json
{
  "id": 1,
  "nombre": "Cafe Latte",
  "precio_publico": 3500,
  "precio_pedidosya": 4200,
  "costo_total": 850,
  "porciones": 1,
  "ingredientes": [
    {
      "ingrediente_id": 1,
      "nombre": "Leche Entera",
      "cantidad": 200,
      "unidad": "ml",
      "costo_unitario": 1.26,
      "tipo": "ingrediente"
    }
  ],
  "rentabilidades": {
    "local_tarjeta": {
      "mc_neto": 62.3,
      "ganancia": 2062,
      "deducciones": [
        { "nombre": "IVA", "porcentaje": 10.5, "monto": 367.5 },
        { "nombre": "IIBB", "porcentaje": 3.3, "monto": 115.5 },
        { "nombre": "Comision Tarjeta", "porcentaje": 3, "monto": 105 }
      ]
    },
    "local_efectivo": { ... },
    "pedidosya": { ... }
  }
}
```

**Logica de negocio**:
- Receta acepta ingredientes directos Y subrecetas en la misma tabla pivot
- Historial de precios: guarda precio anterior al cambiar
- Rentabilidad calculada en tiempo real para 3 canales
- Ingredientes traen la unidad real del ingrediente (no la del pivot)

---

#### Ofertas `/api/ofertas`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar con auto-expiracion |
| POST | `/` | Crear oferta |
| PUT | `/:id` | Actualizar |
| DELETE | `/:id` | Soft delete |

**Tipos de oferta**: `descuento_porcentaje`, `descuento_fijo`, `2x1`, `3x2`, `precio_especial`

**Estados**: `activa`, `pausada`, `programada`, `vencida`

**Logica**: Auto-expira ofertas pasadas, auto-activa programadas al consultar.

---

#### Preparaciones `/api/preparaciones`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar recetas para selector |
| GET | `/:tipo/:id` | Detalle de preparacion |
| PUT | `/:tipo/:id` | Actualizar instrucciones |

**Parametros**:
- `tipo`: `productos` o `subrecetas`
- Filtros GET: `tipo`, `categoria_id`

**Body PUT**:
```json
{
  "preparacion": "Calentar la leche\nAgregar cafe\nEspumar",
  "coccion": "No requiere coccion",
  "tener_en_cuenta": "Servir a 65 grados\nNo recalentar"
}
```

> Los pasos se almacenan como texto plano separado por `\n`. El frontend los parsea a array para edicion individual.

---

#### Dashboard `/api/dashboard`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Metricas y alertas del sistema |

**Response**:
```json
{
  "success": true,
  "data": {
    "counts": {
      "ingredientes": 223,
      "subrecetas": 15,
      "productos": 180,
      "categorias": 8
    },
    "productos_bajo_margen": [
      { "nombre": "Agua Mineral", "min_mc": 12.5 }
    ],
    "ingredientes_sin_proveedor": [
      { "id": 45, "nombre": "Canela" }
    ]
  }
}
```

**Logica**: Identifica productos con MC < 25% en cualquier canal, e ingredientes sin proveedor asignado.

---

#### Costo Producto `/api/costo-producto` (API Externa)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/?nombre=...` | Buscar costo por nombre exacto |

**Detalle completo en la seccion [API Externa de Costos](#api-externa-de-costos).**

---

#### Unidades `/api/unidades`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar todas las unidades activas |

---

#### Configuracion `/api/configuracion`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Todas las configuraciones |
| PUT | `/` | Actualizar un valor (body: `{ clave, valor }`) |

---

#### Proveedores `/api/proveedores`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar con cantidad de ingredientes |
| POST | `/` | Crear |
| PUT | `/:id` | Actualizar |
| DELETE | `/:id` | Soft delete |

**Filtros GET**: `buscar` (por nombre)

---

#### Categorias `/api/categorias`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/ingredientes` | Categorias de ingredientes |
| POST | `/ingredientes` | Crear |
| PUT | `/ingredientes/:id` | Actualizar |
| DELETE | `/ingredientes/:id` | Soft delete |
| GET | `/productos` | Categorias de productos |
| POST | `/productos` | Crear |
| PUT | `/productos/:id` | Actualizar |
| DELETE | `/productos/:id` | Soft delete |

---

#### Canales de Venta `/api/canales`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Listar canales activos |

---

#### Conceptos de Costo `/api/conceptos`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Conceptos + resumen por canal |
| POST | `/` | Crear con asignacion a canales |
| PUT | `/:id` | Actualizar + reasignar canales |
| DELETE | `/:id` | Soft delete |

**Body POST/PUT**:
```json
{
  "nombre": "IVA",
  "tipo": "impuesto",
  "porcentaje": 10.5,
  "descripcion": "Impuesto al Valor Agregado",
  "es_resta": true,
  "canales_ids": [1, 2, 3]
}
```

**Response GET incluye `resumen_canales`**:
```json
{
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
        { "id": 3, "nombre": "Comision Tarjeta", "tipo": "comision", "valor": 3 }
      ]
    }
  }
}
```

---

#### Health Check `/api/health`

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Estado del servidor |

Response: `{ "success": true, "message": "CoffitCost API running" }`

---

### Utilidades y Logica de Negocio

#### response.js
```javascript
success(res, data, status = 200)  // { success: true, data }
error(res, message, status = 400) // { success: false, message }
```

#### recalculate.js - Recalculacion en Cascada
```javascript
recalculateSubreceta(conn, subrecetaId)    // Recalcula costo_total y costo_por_100g
recalculateProducto(conn, productoId)      // Recalcula costo_total del producto
cascadeFromIngredient(conn, ingredienteId) // Ingrediente → Subrecetas → Productos
cascadeFromSubreceta(conn, subrecetaId)    // Subreceta → Productos
```

#### mcNeto.js - Calculo de Rentabilidad
```javascript
calcularRentabilidadCanal(precio, costo, conceptos)  // Un canal
calcularRentabilidades(producto, resumenCanales)       // Los 3 canales
```

---

## Frontend (SPA)

### Configuracion Frontend

- **Build**: Vite 7.3
- **API URL**: `VITE_API_URL` en `.env.production` = `https://coffitcost.saboryaroma.com/api`
- **Routing**: React Router DOM 7 con 10 rutas

### Paginas

| Ruta | Pagina | Descripcion |
|---|---|---|
| `/` | Dashboard | Metricas, alertas de margen bajo, ingredientes sin proveedor |
| `/ingredientes` | Ingredientes | CRUD con filtros, modal con preview de costos, filtro por fecha |
| `/subrecetas` | Subrecetas | CRUD con constructor de receta, calculo de costo/100g |
| `/productos` | Productos | CRUD con tabs (publicados/borradores), receta mixta (ingredientes + subrecetas), MC Neto por canal, filtro MC |
| `/ofertas` | Ofertas | CRUD con tipos de descuento, selector de productos, gestion de estado |
| `/preparaciones` | Preparaciones | Selector cascada (tipo→categoria→receta), vista de instrucciones, edicion de pasos, fullscreen |
| `/rentabilidades` | Rentabilidades | Tabla resumen de MC Neto por canal, promedios, filtro por categoria |
| `/categorias` | Categorias | CRUD tabs (productos/ingredientes), selector emoji, color |
| `/proveedores` | Proveedores | CRUD con busqueda, conteo de ingredientes por proveedor |
| `/configuracion` | Configuracion | Config clave-valor, CRUD conceptos de costo, resumen por canal |

### Componentes Comunes

| Componente | Descripcion |
|---|---|
| `NumericInput` | Input numerico sin problema de leading zeros. Usa `type="text"` con `inputMode="decimal"`, almacena internamente como string, limpia en blur |
| `MCBadge` | Badge coloreado segun MC Neto: rojo (<25%), naranja (25-35%), verde (>35%) |
| `Button` | Boton con variantes (primary, secondary, danger), soporte loading |
| `Modal` | Modal responsive con titulo, footer, multiples tamanos |
| `SearchInput` | Input de busqueda con icono y boton de limpiar |
| `ConfirmDialog` | Modal de confirmacion para acciones destructivas |
| `LoadingSpinner` | Spinner de carga animado |
| `EmptyState` | Mensaje cuando no hay datos |

### State Management

**Server State (React Query)**:
- Cada recurso tiene su query key: `['ingredientes', params]`, `['productos', filters]`, etc.
- Mutaciones invalidan queries relacionadas automaticamente
- Ejemplo: actualizar ingrediente invalida `ingredientes`, `subrecetas`, `productos`, `dashboard`

**Client State (Zustand)**:
| Store | Estado |
|---|---|
| `useIngredientesStore` | filtros (categoria, buscar, orden, antiguedad, fechaDesde, fechaHasta), modalOpen, editingId |
| `useProductosStore` | tabActivo, buscar, categoriaId, modalOpen, editingId |
| `useUIStore` | sidebarOpen (responsive) |

### API Client

`frontend/src/api/client.ts` - Instancia Axios:
- Base URL desde `VITE_API_URL`
- Timeout: 15 segundos
- Interceptor: extrae `data` del response, formatea errores

### Utilidades Frontend

#### formatters.ts
| Funcion | Input | Output |
|---|---|---|
| `formatMoney(num)` | `1234.5` | `$1,234.50` |
| `formatDate(dateStr)` | `2026-02-14T...` | `14/02/2026` |
| `formatPercent(num)` | `62.345` | `62.3%` |
| `formatNumber(num, dec)` | `1234.567, 2` | `1,234.57` |

#### calculators.ts
| Funcion | Descripcion |
|---|---|
| `calcularCostoUnitario(precio, contenido)` | precio / contenido |
| `calcularCostoConDesperdicio(precio, contenido, desperdicio)` | Con ajuste de desperdicio |
| `calcularMCNeto(precio, costo, resumenCanal)` | MC Neto completo con deducciones |
| `getMCClass(mc)` | CSS class por rango |
| `getMCColor(mc)` | Color hex por rango |
| `calcularMarkup(precio, costo)` | ((precio - costo) / costo) * 100 |

#### normalizers.ts
| Funcion | Descripcion |
|---|---|
| `normalizarTexto(texto)` | Minusculas, sin acentos, sin n/c especiales |

---

## Formulas y Calculos

### Costo Unitario

```
costo_unitario = precio_envase / contenido_envase
```

Ejemplo: Envase de leche de $1200 con 1 litro = $1200/L

### Costo con Desperdicio

```
costo_con_desperdicio = costo_unitario / (1 - desperdicio / 100)
```

Ejemplo: Costo $1200/L con 5% desperdicio = $1200 / (1 - 0.05) = $1263.16/L

### Costo de Subreceta

```
costo_total = SUM(cantidad_ingrediente * costo_con_desperdicio_ingrediente)
costo_por_100g = (costo_total / rendimiento_gramos) * 100
```

### Costo de Producto

```
// Ingredientes directos:
costo_ingrediente = cantidad * costo_con_desperdicio

// Subrecetas (tipo gramos):
costo_subreceta = cantidad * (costo_por_100g / 100)

// Subrecetas (tipo porciones):
costo_subreceta = cantidad * (costo_total / rendimiento_porciones)

// Total:
costo_total_producto = SUM(costos de todos los items de receta)
costo_por_porcion = costo_total_producto / porciones
```

### MC Neto (Margen de Contribucion Neto)

Para cada canal de venta:

```
1. Por cada concepto del canal:
   deduccion = precio * (concepto.porcentaje / 100)

2. Totales:
   total_deducciones = SUM(deducciones)
   descuento_monto = SUM(deducciones tipo 'descuento')
   precio_neto = precio - descuento_monto

3. Ganancia y margen:
   ganancia = precio - costo_por_porcion - total_deducciones
   mc_neto = (ganancia / precio_neto) * 100
```

**Ejemplo Canal Tarjeta** (precio $3500, costo $850):
```
IVA 10.5%   = $367.50
IIBB 3.3%   = $115.50
Com. Tarj 3% = $105.00
Total deducciones = $588.00

Ganancia = $3500 - $850 - $588 = $2062
MC Neto = ($2062 / $3500) * 100 = 58.9%
```

### Recalculacion en Cascada

Cuando cambia el precio de un ingrediente:

```
1. Ingrediente actualizado
   ↓ recalcula costo_unitario y costo_con_desperdicio
2. Subrecetas que usan ese ingrediente
   ↓ recalcula costo_total y costo_por_100g
3. Productos que usan ese ingrediente directamente
   ↓ recalcula costo_total
4. Productos que usan subrecetas afectadas
   ↓ recalcula costo_total
```

Todas las recalculaciones se ejecutan dentro de una transaccion SQL.

---

## API Externa de Costos

CoffitCost expone un endpoint dedicado para que sistemas externos consulten el costo por porcion de cualquier producto.

### Endpoint /api/costo-producto

**URL**: `GET https://coffitcost.saboryaroma.com/api/costo-producto`

**Parametros**:
| Parametro | Tipo | Requerido | Descripcion |
|---|---|---|---|
| nombre | string | Si | Nombre exacto del producto |

**Response exitosa** (HTTP 200):
```json
{
  "success": true,
  "costo_porcion": 850.25,
  "producto": "Cafe Latte"
}
```

**Response error** (HTTP 200):
```json
{
  "success": false,
  "error": "Producto no encontrado",
  "sugerencias": ["Cafe Latte Doble", "Cafe Mocha"]
}
```

**Logica interna**:
1. Busca producto por nombre exacto (case-insensitive) en productos activos no-borrador
2. Calcula `costo_porcion = costo_total / porciones` (redondeado a 2 decimales)
3. Si no encuentra: busca similares con LIKE y devuelve hasta 5 sugerencias

**Ejemplo de uso**:
```bash
curl "https://coffitcost.saboryaroma.com/api/costo-producto?nombre=Cafe+Latte"
```

**Notas**:
- No requiere autenticacion (el parametro `api_key` se ignora si se envia)
- CORS permite `saboryaroma.com` y requests sin origin (server-to-server)
- Solo busca productos publicados (`es_borrador = 0`)

---

### Integracion con App PHP (RentCoffit)

La app de rentabilidad ubicada en `https://saboryaroma.com/rentcoffit/` consume este endpoint para asignar costos a las ventas registradas.

#### Flujo de integracion:

```
RentCoffit (PHP)                     CoffitCost (Node.js)
     |                                       |
     |  1. POST /api/actualizar_costos.php   |
     |     { anio: 2026, mes: 2 }            |
     |                                       |
     |  2. Para cada producto vendido:        |
     |     CoffitCostAPI->getCosto("Cafe")   |
     |          |                             |
     |          |--- GET /api/costo-producto  |
     |          |    ?nombre=Cafe+Latte  ---->|
     |          |                             |
     |          |<---- { success: true,       |
     |          |        costo_porcion: 850 } |
     |          |                             |
     |  3. UPDATE ventas_items               |
     |     SET costo_unitario = 850           |
     |                                       |
```

### Clase CoffitCostAPI (PHP)

Ubicacion: `coffitcost.php` (en la carpeta `api/` de RentCoffit)

**Constructor**:
```php
$this->baseUrl = defined('COFFITCOST_API_URL')
    ? COFFITCOST_API_URL
    : 'https://coffitcost.saboryaroma.com/api/costo-producto';
```

> Si `COFFITCOST_API_URL` esta definida en `credentials.php`, usa ese valor. Sino, usa la URL por defecto.

**Metodos publicos**:

| Metodo | Descripcion |
|---|---|
| `getCosto($nombreProducto)` | Consulta costo de un producto. Devuelve `['success' => bool, 'costo' => float, 'producto' => string]` |
| `getCostosBatch($nombres)` | Consulta multiples productos. Devuelve array asociativo nombre => resultado |
| `clearCache()` | Limpia cache en memoria |

**Caracteristicas**:
- **Cache doble**: en memoria (vida del request) + persistente en archivo JSON (24h TTL)
- **Retry con backoff exponencial**: 3 intentos, delay incremental
- **Errores retryable**: timeout, connection refused, HTTP 429/500/502/503/504
- **Cache file**: `../cache/coffitcost_cache.json`

**Ejemplo de uso**:
```php
$coffitCost = new CoffitCostAPI();
$resultado = $coffitCost->getCosto('Cafe Latte');

if ($resultado['success']) {
    echo "Costo por porcion: $" . $resultado['costo'];
    // Output: Costo por porcion: $850.25
} else {
    echo "Error: " . $resultado['error'];
    echo "Sugerencias: " . implode(', ', $resultado['sugerencias']);
}
```

**Configuracion requerida en `credentials.php`**:
```php
define('COFFITCOST_API_URL', 'https://coffitcost.saboryaroma.com/api/costo-producto');
define('COFFITCOST_API_KEY', ''); // No requerido actualmente
```

### Endpoint actualizar_costos.php

Ubicacion: `actualizar_costos.php` (en la carpeta `api/` de RentCoffit)

**GET** `/api/actualizar_costos.php?anio=2026&mes=2`
- Ver productos sin costo asignado en un periodo

**POST** `/api/actualizar_costos.php`
```json
{ "anio": 2026, "mes": 2, "limpiar_cache": true }
```
- Recorre todos los productos vendidos del periodo
- Excluye productos con costo manual
- Consulta CoffitCost API para cada producto
- Actualiza `ventas_items` y `ventas_pedidosya_items`
- Respeta prioridad: manual > coffitcost > pendiente

**Response POST**:
```json
{
  "success": true,
  "mensaje": "Costos actualizados: 450 items locales, 120 items PedidosYa",
  "periodo": { "anio": 2026, "mes": 2 },
  "items_actualizados": 450,
  "items_pya_actualizados": 120,
  "productos_consultados": 85,
  "productos_sin_costo": [
    {
      "producto": "Producto Especial",
      "error": "Producto no encontrado",
      "sugerencias": ["Producto Especial 2"]
    }
  ],
  "cache_limpiado": true
}
```

---

## Canales de Venta y Conceptos

CoffitCost soporta 3 canales de venta, cada uno con conceptos de costo configurables:

### Canal: Local Tarjeta 💳
| Concepto | Tipo | % |
|---|---|---|
| IVA | Impuesto | 10.50% |
| IIBB | Impuesto | 3.30% |
| Comision Tarjeta | Comision | 3.00% |
| **Total deducciones** | | **16.80%** |

### Canal: Local Efectivo 💵
| Concepto | Tipo | % |
|---|---|---|
| IVA | Impuesto | 10.50% |
| IIBB | Impuesto | 3.30% |
| Descuento Efectivo | Descuento | 10.00% |
| **Total deducciones** | | **23.80%** |

### Canal: PedidosYa 🛵
| Concepto | Tipo | % |
|---|---|---|
| IVA | Impuesto | 10.50% |
| IIBB | Impuesto | 3.30% |
| Comision PedidosYa | Comision | 22.00% |
| **Total deducciones** | | **35.80%** |

> Los conceptos son 100% configurables desde la pagina de Configuracion. Se pueden agregar, modificar porcentajes, asignar a canales con override de porcentaje por canal.

---

## Deployment

### Backend en Hostinger

1. Hostinger Node.js hosting en `coffitcost.saboryaroma.com`
2. Subir carpeta `backend/` completa al hosting
3. Configurar `.env` en el servidor:
```env
DB_HOST=127.0.0.1
DB_NAME=u482097276_cofcost
DB_USER=u482097276_cofcost
DB_PASSWORD=Saboryaroma90*
DB_PORT=3306
PORT=3001
CORS_ORIGIN=https://coffitcost.vercel.app,https://saboryaroma.com
NODE_ENV=production
```
4. Iniciar con `npm start`

### Frontend en Vercel

1. Conectar repositorio o deploy manual
2. `.env.production`:
```env
VITE_API_URL=https://coffitcost.saboryaroma.com/api
```
3. Deploy:
```bash
cd frontend
vercel --prod
```

### Base de Datos en Hostinger

1. Acceder a phpMyAdmin desde panel Hostinger
2. Ejecutar `backend/database/schema.sql` (crea 15 tablas)
3. Ejecutar `backend/database/seed.sql` (datos iniciales)

> Hostinger **no permite** conexiones remotas MySQL. Las migraciones deben ejecutarse via phpMyAdmin.

---

## Variables de Entorno

### Backend (`backend/.env`)
| Variable | Valor | Descripcion |
|---|---|---|
| DB_HOST | 127.0.0.1 | Host MySQL |
| DB_NAME | u482097276_cofcost | Nombre de la BD |
| DB_USER | u482097276_cofcost | Usuario MySQL |
| DB_PASSWORD | Saboryaroma90* | Password MySQL |
| DB_PORT | 3306 | Puerto MySQL |
| PORT | 3001 | Puerto del servidor Express |
| CORS_ORIGIN | https://coffitcost.vercel.app,https://saboryaroma.com | Origenes permitidos (separados por coma) |
| NODE_ENV | production | Entorno |

### Frontend (`frontend/.env.production`)
| Variable | Valor | Descripcion |
|---|---|---|
| VITE_API_URL | https://coffitcost.saboryaroma.com/api | Base URL de la API |

### PHP - RentCoffit (`credentials.php`)
| Constante | Valor | Descripcion |
|---|---|---|
| COFFITCOST_API_URL | https://coffitcost.saboryaroma.com/api/costo-producto | URL del endpoint de costos |
| COFFITCOST_API_KEY | (vacio) | No requerido actualmente |

---

## Comandos Utiles

### Backend
```bash
cd backend

# Desarrollo (auto-restart con nodemon)
npm run dev

# Produccion
npm start

# Migrar base de datos (solo local, no Hostinger)
npm run migrate
```

### Frontend
```bash
cd frontend

# Desarrollo
npm run dev

# Build produccion
npm run build

# Deploy a Vercel
vercel --prod

# Preview del build
npm run preview
```

### Testear API de costos
```bash
# Health check
curl https://coffitcost.saboryaroma.com/api/health

# Consultar costo de un producto
curl "https://coffitcost.saboryaroma.com/api/costo-producto?nombre=Cafe+Latte"

# Listar ingredientes
curl https://coffitcost.saboryaroma.com/api/ingredientes

# Listar productos publicados
curl "https://coffitcost.saboryaroma.com/api/productos?es_borrador=0"
```

---

# ADENDA - Nuevas funcionalidades agregadas

Esta seccion documenta todas las funcionalidades incorporadas al sistema posteriormente a la version inicial del README. Esta pensada para auditorias, control de desarrollo e integracion. Cada seccion detalla la capa afectada (base de datos, backend, frontend) y la logica de negocio asociada.

## Tabla de contenidos - Adenda

1. [Hosting y deploy actualizado](#hosting-y-deploy-actualizado)
2. [Modulo Produccion (registro + reportes)](#modulo-produccion-registro--reportes)
3. [Modulo Perdidas y consumos](#modulo-perdidas-y-consumos)
4. [Modulo Envios a Sabor y Aroma (Coffit a SyA)](#modulo-envios-a-sabor-y-aroma)
5. [Modulo Envios a Coffit (SyA a Coffit)](#modulo-envios-a-coffit)
6. [Modulo Reportes SyA (reporteria cruzada)](#modulo-reportes-sya)
7. [Mejoras al modulo Productos](#mejoras-al-modulo-productos)
8. [Mejoras al modulo Subrecetas](#mejoras-al-modulo-subrecetas)
9. [Mejoras al modulo Ingredientes](#mejoras-al-modulo-ingredientes)
10. [Endpoints publicos para integraciones](#endpoints-publicos-para-integraciones)
11. [Acceso restringido para colaboradores](#acceso-restringido-para-colaboradores)
12. [Configuracion dinamica del nombre del negocio](#configuracion-dinamica-del-nombre-del-negocio)
13. [Resumen de nuevos archivos y tablas](#resumen-de-nuevos-archivos-y-tablas)
14. [Checklist de deploy para auditoria](#checklist-de-deploy-para-auditoria)

---

## Hosting y deploy actualizado

El frontend ya no se despliega en Vercel. Ahora se despliega manualmente al hosting Hostinger bajo el dominio:

- **URL produccion frontend**: `https://coffitcost.saboryaroma.com`
- **URL produccion backend**: `https://coffitcost.saboryaroma.com/api`

### Configuracion Apache (.htaccess)

El build del frontend incluye un `public/.htaccess` que configura:

- **Rewrite rules** para que todas las rutas SPA apunten a `index.html` (resuelve el 404 al recargar sub-rutas como `/envios-coffit`)
- **No reescribir** `/api/*` (permite que el backend responda si esta en el mismo dominio)
- **Cache agresivo** para assets con hash (JS, CSS, imagenes, fuentes)
- **No cache** para `index.html` (asegura que siempre se bajen los assets nuevos tras deploy)

Archivo: `frontend/public/.htaccess`

### Pasos de deploy

**Frontend:**
```bash
cd frontend
npm run build
# Subir todo el contenido de frontend/dist/ a la carpeta publica del dominio via FTP o File Manager
# Importante: incluir el archivo oculto .htaccess
```

**Backend:**
- Subir via FTP/SSH los archivos modificados dentro de `backend/src/`
- Reiniciar el proceso Node en el panel de Hostinger (Setup Node.js App -> Restart)

**Base de datos:**
- Ejecutar los SQL de las nuevas tablas en phpMyAdmin sobre la base `u482097276_cofcost`

---

## Modulo Produccion (registro + reportes)

### Proposito

Gestionar la produccion diaria de productos y subrecetas con registro por operario, y generar reportes consolidados sobre esa produccion.

### Base de datos

**Tabla `operarios`**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | ID unico |
| `nombre` | VARCHAR(100) | Nombre del operario |
| `activo` | TINYINT(1) DEFAULT 1 | Soft delete |
| `created_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

**Tabla `produccion_registros`**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | |
| `fecha` | DATE NOT NULL | Fecha del registro |
| `hora_ingreso` | TIME NULL | Inicio de la preparacion |
| `hora_salida` | TIME NULL | Fin de la preparacion |
| `producto_nombre` | VARCHAR(200) | Nombre (copiado, no FK obligatoria) |
| `producto_id` | INT NULL | FK opcional a `productos` |
| `cantidad` | DECIMAL(10,2) | Unidades producidas |
| `estado` | ENUM: 'Completado','En proceso','Cancelado' | |
| `observacion` | TEXT NULL | |
| `operario_id` | INT NULL | FK a `operarios` |
| `operario_nombre` | VARCHAR(100) | Copia del nombre al momento |
| `created_at`, `updated_at` | TIMESTAMP | |

SQL: `backend/database/produccion_schema.sql`

### Backend

**Archivo:** `backend/src/routes/produccion.js` registrado en `/api/produccion`

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/operarios` | Lista operarios activos |
| POST | `/operarios` | Alta operario |
| DELETE | `/operarios/:id` | Soft delete operario |
| GET | `/registros` | Lista registros con filtros: `desde`, `hasta`, `estado`, `operario_id`, `producto`, `limit`, `offset`. Retorna paginado con `total` |
| POST | `/registros` | Batch insert (array `registros`) transaccional |
| PUT | `/registros/:id` | Actualizar registro |
| DELETE | `/registros/:id` | Eliminar registro (hard delete) |
| GET | `/reportes` | Reporte consolidado. Params `desde`, `hasta`, `operario_id`, `producto`. Retorna `porProducto`, `porOperario`, `porDia`, `totales`, `porEstado` |
| GET | `/productos-catalogo` | UNION de productos + subrecetas activas para dropdown |
| GET | `/reporte-ingredientes` | Ingredientes consumidos derivados de la produccion. Incluye ingredientes directos de productos + ingredientes anidados dentro de subrecetas. Params `desde`, `hasta`, `buscar` |

### Logica del reporte de ingredientes usados

El endpoint `/api/produccion/reporte-ingredientes` calcula cuantos gramos/unidades de cada ingrediente se consumieron basandose en los registros de produccion:

- **Parte 1:** Ingredientes directos del producto: `pr.cantidad * pi.cantidad`
- **Parte 2:** Ingredientes dentro de subrecetas: `pr.cantidad * pi.cantidad * (si.cantidad / NULLIF(s.rendimiento_gramos, 0))` (proporcion del ingrediente dentro del rendimiento de la subreceta)
- Se unen con `UNION ALL` y se agrupa por `ingrediente_id` sumando ambos aportes
- Retorna cantidad total, costo consumido (multiplicando por `costo_con_desperdicio`) y porcentaje de uso sobre el total
- Solo considera registros con `estado='Completado'` y `producto_id NOT NULL`

### Frontend

**Pagina `/produccion`** (standalone, full-screen para tablet, sin sidebar ni header)

Archivo: `frontend/src/pages/Produccion.tsx`

- Barra superior custom con branding y volver
- Formulario con fecha, hora ingreso/salida (opcionales), operario global
- Multiples filas de productos con cantidad, estado y observacion
- Buscador de productos con autocompletado
- Gestor embebido de operarios (crear/borrar)
- Batch save: guarda todas las filas como registros en una transaccion
- Optimizado para uso tactil en cocina

**Pagina `/reportes-produccion`** (dentro de MainLayout)

Archivo: `frontend/src/pages/ReportesProduccion.tsx`

Tres tabs:

1. **Reportes** — stat cards, graficos de produccion por producto, operario, dia (progress bars) y estado. Filtros por periodo (hoy/semana/mes/rango) mas filtros dinamicos por operario y producto (funcionan combinados)
2. **Ingredientes usados** — top 10 en barras de progreso con conversion automatica (g a Kg, ml a L). Tabla completa con costo consumido. Buscador con debounce. Exportacion CSV
3. **Historial** — listado de registros con filtros (desde/hasta/estado/operario/buscar), edicion inline via modal, eliminar

---

## Modulo Perdidas y consumos

### Proposito

Registrar perdidas (vencimientos, rotura, deterioro, etc.) y consumos internos (productos que consume el duenio o empleados). Comparten tabla pero se separan logicamente via el campo `motivo`.

### Base de datos

**Tabla `perdidas`**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | |
| `fecha` | DATE NOT NULL | |
| `item_tipo` | ENUM: 'producto','ingrediente' | |
| `item_nombre` | VARCHAR(200) | |
| `item_id` | INT NULL | FK opcional (no enforced) |
| `cantidad` | DECIMAL(10,2) | |
| `unidad` | VARCHAR(50) NULL | |
| `motivo` | VARCHAR(200) NULL | "Vencimiento", "Rotura", "Consumo", etc. |
| `responsable` | VARCHAR(100) NULL | |
| `descripcion` | TEXT NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |

SQL: `backend/database/perdidas_schema.sql`

### Backend

**Archivo:** `backend/src/routes/perdidas.js` registrado en `/api/perdidas`

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/items-catalogo` | Productos + ingredientes activos para dropdown |
| GET | `/` | Lista con filtros: `desde`, `hasta`, `item_tipo`, `motivo`, `responsable`, `buscar`, `limit`, `offset` |
| POST | `/` | Crear perdida/consumo |
| PUT | `/:id` | Actualizar |
| DELETE | `/:id` | Eliminar |

**Nota:** el endpoint `/items-catalogo` esta declarado antes que `/:id` para evitar colision de rutas en Express.

### Separacion logica Perdidas vs Consumos

- Registros con `motivo = 'Consumo'` -> tab "Consumo"
- Registros con `motivo != 'Consumo'` -> tab "Perdidas"

### Frontend

**Pagina `/perdidas`** (admin con sidebar) - `frontend/src/pages/Perdidas.tsx`

Dos tabs:

1. **Perdidas** — formulario completo con tipo (producto/ingrediente), cantidad, unidad, motivo (select con vencimiento/rotura/deterioro/etc), responsable (select de operarios), descripcion. Filtros por tipo, motivo, buscador
2. **Consumo** — formulario simplificado: fecha, producto (tipo fijo, solo buscador), cantidad, **Consumo a cargo** (select fijo: Lucas / Maca / Empleado), descripcion. No muestra motivo ni unidad en UI. Internamente guarda `motivo='Consumo'`

**Pagina `/registro-perdidas`** (standalone para colaboradores) - `frontend/src/pages/PerdidasStandalone.tsx`

Misma funcionalidad que la pagina admin pero sin sidebar, optimizada para tablet.

### Motivos hardcodeados

Ubicaciones:
- `frontend/src/pages/Perdidas.tsx` linea 9: `const MOTIVOS = ['Vencimiento', 'Rotura', 'Error de produccion', 'Deterioro', 'Derrame', 'Otro'];`
- `frontend/src/pages/PerdidasStandalone.tsx` linea 11: `const MOTIVOS = ['Error de pedido', 'Error de produccion', 'Deterioro', 'Otros'];`

Responsables del tab Consumo (fijo):
- `CONSUMO_RESPONSABLES = ['Lucas', 'Maca', 'Empleado']`

---

## Modulo Envios a Sabor y Aroma

### Proposito

Registrar productos enviados desde Coffit a la sucursal Sabor y Aroma. El colaborador puede marcar cantidad vencida cuando vuelven productos no vendidos, y el sistema calcula automaticamente cuantos se vendieron.

### Base de datos

**Tabla `envios_saboryaroma`**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | |
| `fecha` | DATE NOT NULL | Fecha del envio |
| `producto_id` | INT NULL | FK a `productos` (LEFT JOIN para tolerar productos borrados) |
| `producto_nombre` | VARCHAR(200) | Copia del nombre |
| `cantidad_enviada` | DECIMAL(10,2) DEFAULT 0 | |
| `cantidad_vencida` | DECIMAL(10,2) DEFAULT 0 | Editable en linea |
| `observacion` | TEXT NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |
| Indices | `idx_fecha`, `idx_producto_id`, `idx_vencida` | |

SQL: `backend/database/envios_saboryaroma_schema.sql`

**Calculo:** `cantidad_vendida = cantidad_enviada - cantidad_vencida` (via columna calculada en SELECT)

### Backend

**Archivo:** `backend/src/routes/envios.js` registrado en `/api/envios`

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/catalogo` | Productos activos no borrador |
| GET | `/reporte` | Reporte agrupado por producto, dia, totales. Params `desde`, `hasta`, `buscar`. JOIN con `productos` para traer `costo_total` y calcular montos |
| GET | `/resultados` | **Balance combinado** con `envios_coffit`. Ver seccion Reportes SyA |
| GET | `/` | Lista con filtros: `desde`, `hasta`, `buscar`, `solo_vencidos`, `limit`, `offset` |
| POST | `/` | Crear envio. Valida `cantidad_enviada > 0` |
| PUT | `/:id` | Actualizar completo. Valida `cantidad_vencida <= cantidad_enviada` |
| PATCH | `/:id/vencidos` | **Actualizacion de solo `cantidad_vencida`**. Usado por el input editable en linea |
| DELETE | `/:id` | Eliminar |

**Orden critico de rutas:** `/catalogo`, `/reporte` y `/resultados` deben declararse ANTES de `/:id` para evitar que Express los interprete como parametros.

### Frontend

**Pagina `/envios-saboryaroma`** (standalone para colaboradores) - `frontend/src/pages/EnviosSaboryAroma.tsx`

Dos tabs:

1. **Envios** — formulario arriba (fecha, producto, cantidad enviada, observacion) + tabla de historial completo con columna "Vencidos" editable en linea. Al salir del input se dispara PATCH automatico. Validacion: `0 <= vencidos <= enviados`. Si se excede, se revierte al valor original. Calculo en vivo de "Vendidos" y pintado rojo cuando hay vencidos
2. **Vencidos** — solo items con `cantidad_vencida > 0`, stat cards de totales, solo lectura

URL para colaboradores: `https://coffitcost.saboryaroma.com/envios-saboryaroma`

**Dropdown de busqueda mejorado:**
- Al hacer focus muestra la lista completa (no requiere escribir)
- Al escribir filtra en vivo
- Feedback de estados: cargando / error / sin resultados
- Uso de `onMouseDown` con `preventDefault` para que el click no sea intercepteado por el `onBlur` del input
- Hasta 30 resultados visibles

---

## Modulo Envios a Coffit

### Proposito

Flujo inverso del anterior: registra ingredientes que SyA envia a Coffit. El colaborador puede marcar cantidad devuelta (ingredientes que Coffit no usa y devuelve a SyA, como vencidos).

### Base de datos

**Tabla `envios_coffit`**

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | INT PK AUTO_INCREMENT | |
| `fecha` | DATE NOT NULL | |
| `ingrediente_id` | INT NULL | FK a `ingredientes` |
| `ingrediente_nombre` | VARCHAR(200) | |
| `cantidad_enviada` | DECIMAL(10,2) DEFAULT 0 | |
| `cantidad_devuelta` | DECIMAL(10,2) DEFAULT 0 | Editable en linea. "Devueltos", no "vencidos" |
| `observacion` | TEXT NULL | |
| `created_at`, `updated_at` | TIMESTAMP | |
| Indices | `idx_fecha`, `idx_ingrediente_id`, `idx_devuelta` | |

SQL: `backend/database/envios_coffit_schema.sql`

**Calculo:** `cantidad_util = cantidad_enviada - cantidad_devuelta`

### Backend

**Archivo:** `backend/src/routes/enviosCoffit.js` registrado en `/api/envios-coffit`

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/catalogo` | Ingredientes activos |
| GET | `/reporte` | Reporte agrupado por ingrediente, dia, totales. JOIN con `ingredientes` para traer `costo_unitario` (sin desperdicio) |
| GET | `/` | Lista con filtros: `desde`, `hasta`, `buscar`, `solo_devueltos`, `limit`, `offset` |
| POST | `/` | Crear envio |
| PUT | `/:id` | Actualizar completo |
| PATCH | `/:id/devueltos` | Actualizar solo `cantidad_devuelta` (inline edit) |
| DELETE | `/:id` | Eliminar |

**Nota:** usa `costo_unitario` (sin merma), no `costo_con_desperdicio`, por decision del negocio.

### Frontend

**Pagina `/envios-coffit`** (standalone) - `frontend/src/pages/EnviosCoffit.tsx`

Dos tabs identicos al modulo anterior pero con ingredientes y cantidad devuelta:

1. **Envios** — fecha, ingrediente, cantidad enviada, observacion. Historial con columna "Devueltos" editable en linea
2. **Devueltos** — solo items con `cantidad_devuelta > 0`, stat cards, solo lectura

URL: `https://coffitcost.saboryaroma.com/envios-coffit`

### Navegacion cruzada

Ambas paginas (`/envios-saboryaroma` y `/envios-coffit`) tienen botones en la barra superior para saltar a la otra seccion, ya que las maneja la misma persona.

---

## Modulo Reportes SyA

### Proposito

Dashboard admin con 3 vistas:
1. Reporte de envios Coffit -> SyA
2. Reporte de envios SyA -> Coffit
3. Resultados consolidados: balance economico entre ambos flujos

### Backend

**Endpoint clave:** `GET /api/envios/resultados?desde=&hasta=`

Calcula el balance combinado consultando ambas tablas (`envios_saboryaroma` + `envios_coffit`).

Estructura de respuesta:

```json
{
  "enviado_a_sya": {
    "monto_enviado": number,
    "monto_vencido": number,
    "monto_util": number,
    "cant_enviada": number,
    "cant_vencida": number
  },
  "recibido_de_sya": {
    "monto_enviado": number,
    "monto_devuelto": number,
    "monto_util": number,
    "cant_enviada": number,
    "cant_devuelta": number
  },
  "balance": number,
  "a_favor": boolean,
  "porDia": [{ "fecha": string, "enviado_sya": number, "recibido_coffit": number, "balance": number }]
}
```

**Logica de balance:**

```
balance = monto_util_enviado_a_sya - monto_util_recibido_de_sya

> 0  -> SyA te debe (a favor de Coffit)
< 0  -> Vos le debes a SyA
= 0  -> Equilibrado
```

Se usa **monto util** (descontando vencidos/devueltos) porque esos son perdidas compartidas, no deudas.

### Frontend

**Pagina `/reportes-envios`** (admin con sidebar) - `frontend/src/pages/ReportesEnvios.tsx`

El archivo principal actua como contenedor con 3 tabs y delega a sub-componentes en `frontend/src/pages/reportes-sya/`:

- `utils.ts` — helpers de fechas (todayStr, getWeekRange, getMonthRange, formatFecha, DAY_NAMES)
- `StatCardAvanzado.tsx` — card reutilizable con icono, cantidad, monto, subtitle
- `TabCoffitASya.tsx` — reporte de productos enviados a SyA
- `TabSyaACoffit.tsx` — reporte de ingredientes recibidos de SyA
- `TabResultados.tsx` — balance, comparativa y detalle por dia

**Tab 1 (Coffit -> SyA):**
- 4 stat cards (enviado, vencido, vendido, productos)
- Grafico torta (monto vendido vs vencido)
- Grafico barras apiladas (evolucion diaria)
- Top 10 productos enviados por monto
- Top 10 productos con vencidos (perdida economica)
- Tabla resumen por producto
- Tabla detalle por registro
- Exportar CSV

**Tab 2 (SyA -> Coffit):** identico al anterior pero con ingredientes, devueltos en lugar de vencidos, color ambar

**Tab 3 (Resultados):**
- 3 cards principales: Envie a SyA, Recibi de SyA, Balance neto (verde/rojo/gris)
- Grafico barras comparativo (monto util enviado vs recibido)
- Grafico compuesto diario: barras (enviado/recibido) + linea (balance)
- Tabla por dia con columnas: Fecha, Envie, Recibi, Balance

Todos los filtros (periodo y busqueda) son dinamicos y disparan refetch via React Query.

### Sidebar

Se renombro "Reportes Envios SyA" a "Reportes SyA" (ahora cubre las 3 vistas). Archivo: `frontend/src/components/layout/Sidebar.tsx`

---

## Mejoras al modulo Productos

### Variante / precio por kg

Archivo: `frontend/src/pages/Productos.tsx` (modal `ProductoModal`)

**Nuevo campo en DB:** `productos.peso_total_g DECIMAL(10,2) DEFAULT NULL`

Migracion:
```sql
ALTER TABLE productos ADD COLUMN peso_total_g DECIMAL(10,2) DEFAULT NULL AFTER costo_total;
```

**En el modal del producto, debajo de la receta, nueva seccion de resumen de costos:**

1. **Costo total preparacion** = suma(`cantidad * costo_unitario` de cada item)
2. **Costo por porcion** = costo_total / porciones
3. **Peso total (g)** — input manual
4. **Costo/kg** = `(costo_total / peso_total_g) * 1000` (solo visible cuando hay peso cargado)
5. **Precio venta/kg** — input donde el usuario simula un precio de venta por kilo
6. **Rentabilidad por canal para venta por kg** — cards de Tarjeta y Efectivo con:
   - Precio
   - Deducciones (IVA, IIBB, comision MP, etc.)
   - Costo/kg
   - Ganancia/kg
   - MC neto %

### Markup % en los inputs de precio

En el modal, debajo de cada input "Precio Local" y "Precio PedidosYa" se muestra en vivo:

```
Markup: ((precio - costo_porcion) / costo_porcion) * 100
```

Colores del badge:
- Rojo: < 50%
- Ambar: 50-100%
- Verde: > 100%

Solo se muestra cuando `costo_porcion > 0` y `precio > 0`.

### Backend

El endpoint POST/PUT de productos acepta `peso_total_g` y lo persiste. El campo es opcional.

---

## Mejoras al modulo Subrecetas

Archivo: `frontend/src/pages/Subrecetas.tsx` (modal `SubrecetaModal`)

### Precio por kg

Cuando `tipo_rendimiento = 'gramos'`:
```
costo_por_kg = (costo_total / rendimiento) * 1000
```

Se muestra en el panel de resumen de costos.

### Simulador de precio venta por kg

Mismo patron que productos:
- Input "Precio venta/kg"
- Cards de MC neto por canal (Tarjeta, Efectivo) con desglose completo de deducciones

---

## Mejoras al modulo Ingredientes

Archivo: `frontend/src/pages/Ingredientes.tsx` y `backend/src/routes/ingredientes.js`

### Orden "Mayor uso en recetas"

Nuevo orden agregado en el select del filtro: `uso_recetas`.

**Logica SQL en el backend:**

```sql
SELECT i.*, ...,
  (IFNULL((SELECT COUNT(*) FROM producto_ingredientes pi WHERE pi.ingrediente_id = i.id), 0)
 + IFNULL((SELECT COUNT(*) FROM subreceta_ingredientes si WHERE si.ingrediente_id = i.id), 0)
  ) AS uso_recetas
FROM ingredientes i
WHERE i.activo = 1
ORDER BY uso_recetas DESC, i.nombre ASC
```

Solo se calcula `uso_recetas` cuando el orden pedido es `uso_recetas` (evita el costo en queries comunes).

**En el frontend:** se muestra una columna adicional "Recetas" con un badge circular mostrando el numero de recetas donde se usa el ingrediente. Esto permite identificar ingredientes criticos (si suben de precio impactan muchas recetas).

### Autoactualizacion de fecha de precio

Cuando el usuario modifica `precio1` en el modal del ingrediente, se actualiza automaticamente `fecha_precio` a la fecha de hoy. Asi el alerta visual de "Precio sin actualizar hace +45 dias" desaparece correctamente cuando se renueva el precio.

Ubicacion del fix: `Ingredientes.tsx`, funcion helper `set()`:

```ts
const set = (key: string, value: string | number) => setForm((f) => {
  const updated = { ...f, [key]: value };
  if (key === 'precio1') {
    updated.fecha_precio = new Date().toISOString().split('T')[0];
  }
  return updated;
});
```

---

## Endpoints publicos para integraciones

Endpoints no autenticados para consumo externo (ej. integracion con sistemas de punto de venta).

### `/api/public/ingredientes` (GET)

Archivo: `backend/src/routes/ingredientesPublic.js` (registrado como `/api/public/ingredientes`)

Retorna array compacto con:
```json
[
  { "id": 1, "nombre": "Harina", "unidad": "kg", "costo": 100.00, "categoria": "Harinas" }
]
```

- `costo` = `costo_con_desperdicio`
- Excluye ingredientes inactivos

### `/api/costos-productos` (GET)

Archivo: `backend/src/routes/costosProductos.js`

Retorna productos con costo cargado:
```json
{
  "productos": [{ "nombre": "Cafe latte", "costo": 850.50 }],
  "total": number,
  "actualizado": ISO_datetime
}
```

- Solo productos con `costo_total > 0`, `activo = 1` y `es_borrador = 0`
- `actualizado` = fecha mas reciente de update entre los productos

### `/api/costo-producto?nombre=Cafe+Latte` (GET)

Archivo: `backend/src/routes/costoProducto.js`

Busca producto por nombre exacto (case-insensitive) y devuelve el costo por porcion. Si no existe, devuelve sugerencias via LIKE.

---

## Acceso restringido para colaboradores

### Diseno del control de acceso

No hay sistema de autenticacion con usuarios/roles. La estrategia implementada es **URLs standalone fuera del MainLayout** que los colaboradores acceden directamente.

### Paginas standalone (sin sidebar, sin header)

Definidas como rutas en `frontend/src/App.tsx` fuera del `<Route element={<MainLayout />}>`:

| URL | Pagina | Destinatario |
|-----|--------|--------------|
| `/produccion` | `Produccion.tsx` | Operario de cocina (tablet) |
| `/registro-perdidas` | `PerdidasStandalone.tsx` | Colaborador que registra perdidas/consumos |
| `/envios-saboryaroma` | `EnviosSaboryAroma.tsx` | Colaborador que envia productos |
| `/envios-coffit` | `EnviosCoffit.tsx` | Mismo colaborador anterior, flujo inverso |

Cada una tiene:
- Top bar propia con branding minimo
- Boton "Volver" al dashboard (aunque el colaborador no deberia usarlo)
- Botones para navegar entre paginas relacionadas (ej. envios)

### Consideraciones de seguridad

**No es seguridad real:** cualquiera con la URL puede acceder. Este modelo funciona porque:
- Los colaboradores no conocen las otras URLs del sistema
- El admin solo comparte la URL especifica a cada uno
- La intencion es ocultar la funcionalidad, no bloquearla

Para upgrade futuro a un sistema con autenticacion real, ver opciones documentadas en conversaciones previas (PIN, JWT con roles, etc.)

---

## Configuracion dinamica del nombre del negocio

Anteriormente el nombre "CoffitCost" estaba hardcodeado. Se refactorizo para tomarlo de la tabla `configuracion`:

**En Configuracion:** clave `nombre_negocio` con el valor definido por el usuario.

**En Sidebar** (`frontend/src/components/layout/Sidebar.tsx`): usa `useQuery` con `staleTime: 5 * 60 * 1000` para minimizar refetch.

**Estado actual:** el usuario eligio poner el nombre fijo "Costos-Coffit" directamente en el codigo. El codigo original con queries a configuracion quedo comentado y puede restaurarse.

Ubicacion:
```tsx
// Sidebar.tsx
<span className="text-xl font-bold text-primary truncate">Costos-Coffit</span>
<span className="text-xs text-white/50 truncate">By Coftech LucLorenzo</span>
```

---

## Resumen de nuevos archivos y tablas

### Tablas nuevas en DB

| Tabla | Proposito |
|-------|-----------|
| `operarios` | Trabajadores de produccion |
| `produccion_registros` | Registros diarios de produccion |
| `perdidas` | Perdidas y consumos (separados por `motivo='Consumo'`) |
| `envios_saboryaroma` | Productos enviados a SyA |
| `envios_coffit` | Ingredientes recibidos de SyA |

### Columnas nuevas en tablas existentes

| Tabla | Columna | Motivo |
|-------|---------|--------|
| `productos` | `peso_total_g DECIMAL(10,2)` | Calcular costo/kg y precio/kg para productos vendidos por porcion |

### Archivos nuevos en backend

```
backend/
├── database/
│   ├── produccion_schema.sql
│   ├── import_registros_viejos.sql
│   ├── perdidas_schema.sql
│   ├── envios_saboryaroma_schema.sql
│   └── envios_coffit_schema.sql
└── src/routes/
    ├── produccion.js
    ├── perdidas.js
    ├── envios.js
    ├── enviosCoffit.js
    ├── costoProducto.js
    ├── costosProductos.js
    └── ingredientesPublic.js
```

### Archivos nuevos en frontend

```
frontend/
├── public/
│   └── .htaccess
├── src/
│   ├── api/
│   │   ├── produccion.ts
│   │   ├── perdidas.ts
│   │   ├── envios.ts
│   │   └── enviosCoffit.ts
│   ├── types/
│   │   ├── produccion.ts
│   │   ├── perdida.ts
│   │   ├── envio.ts
│   │   └── envioCoffit.ts
│   └── pages/
│       ├── Produccion.tsx
│       ├── ReportesProduccion.tsx
│       ├── Perdidas.tsx
│       ├── PerdidasStandalone.tsx
│       ├── EnviosSaboryAroma.tsx
│       ├── EnviosCoffit.tsx
│       ├── ReportesEnvios.tsx
│       └── reportes-sya/
│           ├── utils.ts
│           ├── StatCardAvanzado.tsx
│           ├── TabCoffitASya.tsx
│           ├── TabSyaACoffit.tsx
│           └── TabResultados.tsx
```

### Archivos modificados en frontend (principales)

- `src/App.tsx` — nuevas rutas standalone y admin
- `src/components/layout/Sidebar.tsx` — nuevos items de menu, branding fijo
- `src/components/layout/Header.tsx` — titulos de nuevas paginas
- `src/types/index.ts` — exports de nuevos tipos
- `src/pages/Ingredientes.tsx` — filtro de uso en recetas, autodate de precio
- `src/pages/Productos.tsx` — peso/kg/markup en modal
- `src/pages/Subrecetas.tsx` — precio/kg y simulador MC
- `src/components/common/NumericInput.tsx` — soporte de placeholder

---

## Checklist de deploy para auditoria

### Antes de desplegar

- [ ] Ejecutar `npm run build` en `frontend/` sin errores de TypeScript
- [ ] Verificar que `frontend/dist/` contiene: `index.html`, `.htaccess`, `assets/`
- [ ] Ejecutar en DB (phpMyAdmin, base `u482097276_cofcost`) los SQL:
  - `produccion_schema.sql`
  - `perdidas_schema.sql`
  - `envios_saboryaroma_schema.sql`
  - `envios_coffit_schema.sql`
  - Alter: `ALTER TABLE productos ADD COLUMN peso_total_g DECIMAL(10,2) DEFAULT NULL AFTER costo_total;` (si no existe)
- [ ] Verificar variables de entorno en `backend/.env`: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `CORS_ORIGIN`

### Deploy backend (Hostinger)

- [ ] Subir archivos modificados de `backend/src/routes/`
- [ ] Subir `backend/src/index.js` actualizado con todas las rutas registradas
- [ ] Reiniciar proceso Node desde Setup Node.js App en hPanel
- [ ] Probar health check: `curl https://coffitcost.saboryaroma.com/api/health`
- [ ] Probar endpoints criticos:
  - `GET /api/envios/catalogo`
  - `GET /api/envios-coffit/catalogo`
  - `GET /api/produccion/operarios`

### Deploy frontend (Hostinger)

- [ ] Subir contenido completo de `frontend/dist/` a la carpeta publica del dominio
- [ ] Verificar que el `.htaccess` se subio (archivo oculto)
- [ ] Probar que las rutas SPA directas funcionan:
  - `https://coffitcost.saboryaroma.com/produccion`
  - `https://coffitcost.saboryaroma.com/envios-saboryaroma`
  - `https://coffitcost.saboryaroma.com/envios-coffit`
  - `https://coffitcost.saboryaroma.com/registro-perdidas`
- [ ] Probar recarga con Ctrl+Shift+R para vaciar cache del navegador

### Verificacion post-deploy

- [ ] Crear un envio a SyA desde `/envios-saboryaroma` y verificar en `/reportes-envios` que aparece
- [ ] Marcar vencidos en un envio y verificar que la tab Vencidos lo refleja
- [ ] Crear un envio de ingredientes desde `/envios-coffit` y verificar el tab SyA -> Coffit en reportes
- [ ] Verificar que la tab Resultados muestra el balance correcto
- [ ] Crear un registro de produccion y verificar que aparece en el reporte de ingredientes usados
- [ ] Crear una perdida y un consumo y verificar que estan separados en las tabs correctas

### URLs de referencia

| Proposito | URL |
|-----------|-----|
| Admin (Dashboard) | `https://coffitcost.saboryaroma.com/` |
| Admin (Reportes SyA) | `https://coffitcost.saboryaroma.com/reportes-envios` |
| Admin (Reportes produccion) | `https://coffitcost.saboryaroma.com/reportes-produccion` |
| Colaborador (Produccion) | `https://coffitcost.saboryaroma.com/produccion` |
| Colaborador (Perdidas y consumos) | `https://coffitcost.saboryaroma.com/registro-perdidas` |
| Colaborador (Envios Coffit a SyA) | `https://coffitcost.saboryaroma.com/envios-saboryaroma` |
| Colaborador (Envios SyA a Coffit) | `https://coffitcost.saboryaroma.com/envios-coffit` |
| API Health | `https://coffitcost.saboryaroma.com/api/health` |
| API Publica ingredientes | `https://coffitcost.saboryaroma.com/api/public/ingredientes` |
| API Publica costos productos | `https://coffitcost.saboryaroma.com/api/costos-productos` |
