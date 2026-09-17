# Modulo de Preparaciones - CoffitCost

## Que es esta seccion

La seccion **Preparaciones** permite ver y editar las instrucciones de como preparar un producto o subreceta. Muestra:

- Lista de ingredientes con cantidades
- Pasos de preparacion (numerados)
- Instrucciones de coccion
- Notas importantes ("A tener en cuenta")

**NO calcula costos** - eso se hace en otras secciones.

---

## Tablas de Base de Datos

### Campos en tabla `productos`

```sql
-- Estos campos almacenan la preparacion de cada producto
ALTER TABLE productos ADD COLUMN preparacion TEXT;
ALTER TABLE productos ADD COLUMN coccion TEXT;
ALTER TABLE productos ADD COLUMN tener_en_cuenta TEXT;
```

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `preparacion` | TEXT | Pasos de preparacion separados por `\n` (salto de linea) |
| `coccion` | TEXT | Instrucciones de coccion (temperatura, tiempo, etc.) |
| `tener_en_cuenta` | TEXT | Notas importantes, advertencias, tips |

**Ejemplo de dato guardado en `preparacion`:**
```
Precalentar horno a 180°C
Mezclar ingredientes secos
Agregar huevos y batir
Verter en molde
Hornear por 45 minutos
```

---

### Tabla `subrecetas`

```sql
CREATE TABLE subrecetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    rendimiento_gramos DECIMAL(10,2) DEFAULT 100,
    costo_total DECIMAL(12,2) DEFAULT 0,
    costo_por_100g DECIMAL(12,4) DEFAULT 0,
    notas TEXT,                    -- Notas de la subreceta
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Para preparaciones solo importa el campo `notas`.

---

### Tabla `subreceta_ingredientes`

```sql
CREATE TABLE subreceta_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subreceta_id INT NOT NULL,
    ingrediente_id INT NOT NULL,
    cantidad DECIMAL(10,4) NOT NULL DEFAULT 0,
    unidad VARCHAR(20) DEFAULT 'g',
    FOREIGN KEY (subreceta_id) REFERENCES subrecetas(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE
);
```

---

### Tabla `producto_ingredientes`

```sql
CREATE TABLE producto_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    ingrediente_id INT,          -- NULL si es subreceta
    subreceta_id INT,            -- NULL si es ingrediente
    cantidad DECIMAL(10,4) NOT NULL DEFAULT 0,
    unidad VARCHAR(20) DEFAULT 'g',
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE,
    FOREIGN KEY (subreceta_id) REFERENCES subrecetas(id) ON DELETE CASCADE
);
```

**Logica:**
- Si `ingrediente_id` tiene valor = es un ingrediente directo
- Si `subreceta_id` tiene valor = es una subreceta

---

## Logica de Funcionamiento

### 1. Seleccion de receta

```
Usuario selecciona:
1. Tipo: "Productos" o "Subrecetas"
2. Categoria (solo si es producto)
3. Receta especifica

Sistema carga:
- Datos de la receta (nombre, porciones)
- Lista de ingredientes con cantidades
- Pasos de preparacion
- Coccion
- Notas
```

### 2. Mostrar ingredientes

Para **productos**: consulta `producto_ingredientes` uniendo con `ingredientes` y `subrecetas`

```sql
SELECT
    pi.cantidad,
    pi.unidad,
    COALESCE(i.nombre, s.nombre) as nombre
FROM producto_ingredientes pi
LEFT JOIN ingredientes i ON pi.ingrediente_id = i.id
LEFT JOIN subrecetas s ON pi.subreceta_id = s.id
WHERE pi.producto_id = ?
```

Para **subrecetas**: consulta `subreceta_ingredientes` uniendo con `ingredientes`

```sql
SELECT
    si.cantidad,
    si.unidad,
    i.nombre
FROM subreceta_ingredientes si
JOIN ingredientes i ON si.ingrediente_id = i.id
WHERE si.subreceta_id = ?
```

### 3. Mostrar pasos de preparacion

Los pasos se guardan en un solo campo TEXT separados por `\n`.

```javascript
// Frontend: convertir texto a pasos numerados
var pasos = receta.preparacion.split('\n');
pasos.forEach(function(paso, index) {
    // Mostrar: "1. Precalentar horno"
    // Mostrar: "2. Mezclar ingredientes"
});
```

### 4. Guardar preparacion

Al editar, se juntan los pasos en un solo string:

```javascript
var pasos = [];
// Recopilar cada input de paso
inputs.forEach(function(input) {
    if (input.value.trim()) {
        pasos.push(input.value.trim());
    }
});

var data = {
    preparacion: pasos.join('\n'),  // Une con saltos de linea
    coccion: "180°C por 45 min",
    tener_en_cuenta: "No abrir el horno"
};

// PUT /api/preparaciones.php?id=123
```

---

## Flujo de la Seccion

```
┌─────────────────────────────────────────────────────────┐
│  FILTROS                                                │
│  [Tipo: Productos ▼] [Categoria ▼] [Receta ▼]          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  CARD DE PREPARACION                                    │
│                                                         │
│  Nombre: Torta de Chocolate                             │
│  Categoria: Tortas | 12 porciones                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🥣 INGREDIENTES                                  │   │
│  │  • Harina ...................... 300 g          │   │
│  │  • Azucar ...................... 200 g          │   │
│  │  • Huevos ...................... 4 u            │   │
│  │  • Ganache de chocolate ........ 200 g          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📝 PREPARACION                                   │   │
│  │  1. Precalentar horno a 180°C                   │   │
│  │  2. Mezclar harina y azucar                     │   │
│  │  3. Agregar huevos y batir                      │   │
│  │  4. Verter en molde enmantecado                 │   │
│  │  5. Hornear por 45 minutos                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔥 COCCION                                       │   │
│  │  Horno 180°C por 45 minutos                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⚠️ A TENER EN CUENTA                            │   │
│  │  No abrir el horno los primeros 30 minutos.    │   │
│  │  Dejar enfriar antes de desmoldar.             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [✏️ Editar] [📄 Exportar PDF] [🔍 Pantalla Completa]  │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### GET - Obtener productos de una categoria

```
GET /api/preparaciones.php?categoria_id=1
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "nombre": "Torta chocolate", "tiene_preparacion": true },
    { "id": 2, "nombre": "Torta vainilla", "tiene_preparacion": false }
  ]
}
```

### GET - Obtener preparacion de un producto

```
GET /api/preparaciones.php?id=1
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Torta de chocolate",
    "porciones": 12,
    "preparacion": "Precalentar horno\nMezclar ingredientes\nHornear",
    "coccion": "180°C por 45 min",
    "tener_en_cuenta": "No abrir el horno",
    "ingredientes": [
      { "nombre": "Harina", "cantidad": 300, "unidad": "g" },
      { "nombre": "Ganache", "cantidad": 200, "unidad": "g", "es_subreceta": true }
    ]
  }
}
```

### PUT - Actualizar preparacion

```
PUT /api/preparaciones.php?id=1
Content-Type: application/json

{
  "preparacion": "Paso 1\nPaso 2\nPaso 3",
  "coccion": "180°C por 45 min",
  "tener_en_cuenta": "Notas importantes"
}
```

---

## SQL para Migrar Datos

```sql
-- Ejecutar en la BD DESTINO
SET FOREIGN_KEY_CHECKS = 0;

-- Copiar subrecetas
DELETE FROM `subreceta_ingredientes`;
DELETE FROM `subrecetas`;

INSERT INTO `subrecetas`
SELECT * FROM `u482097276_coffitcost`.`subrecetas`;

INSERT INTO `subreceta_ingredientes`
SELECT * FROM `u482097276_coffitcost`.`subreceta_ingredientes`;

SET FOREIGN_KEY_CHECKS = 1;
```

**Nota:** Los campos `preparacion`, `coccion` y `tener_en_cuenta` estan en la tabla `productos`, asi que se migran junto con los productos.
