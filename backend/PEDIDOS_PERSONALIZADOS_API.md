# API de Pedidos Personalizados — contrato para el POS

API de CoffitCost para armar, cotizar y crear pedidos de productos personalizados
(budines, tortas, etc.). Todos los ejemplos son respuestas reales de producción.

- **URL base:** `https://apicoffit.saboryaroma.com/api/public/pp`
- **Formato:** JSON. Toda respuesta viene envuelta en
  `{ "success": true, "data": ... }` o `{ "success": false, "message": "..." }`.
- **CORS:** abierto.
- **Costos:** nunca se exponen. Solo precios de venta.
- **El precio lo calcula siempre el servidor.** El POS no manda precios; manda
  qué eligió y el servidor devuelve cuánto cuesta.

| Método | Ruta | Clave | Para qué |
|---|---|---|---|
| GET | `/catalogo` | no | Productos, pasos y opciones |
| POST | `/cotizar` | no | Calcular precio y validar, sin guardar |
| POST | `/pedidos` | **sí** | Crear un pedido |
| GET | `/pedidos/:numero` | **sí** | Ver un pedido |
| PATCH | `/pedidos/:numero/estado` | **sí** | Cambiar el estado |

**Clave:** header `X-API-Key: <clave>`. Usarla solo desde el servidor del POS,
nunca en código que corra en el navegador.

---

## Modelo

Un **producto** se arma recorriendo **pasos** en orden. Cada paso tiene
**opciones** y una regla de cuántas se eligen:

- `min_sel`: mínimo (0 = opcional). `max_sel`: máximo.
- Ej. Harina `1/1` (obligatorio, una), Toppings `0/3` (opcional, hasta 3).

Cada **opción** tiene:

- `precio` + `precio_modo`:
  - `"fijo"` → suma `precio` al ítem.
  - `"por_kg"` → suma `precio × peso del ítem`.
- `peso_kg`: el peso que aporta al ítem (ej. el tamaño de una torta).
  El peso del ítem es la suma de los `peso_kg` de lo elegido.
- `depende_de`: id de otra opción. Si no es `null`, la opción **solo está
  disponible si se eligió esa otra** (ej. los tamaños de cada versión de torta).

**Regla de visibilidad en un paso:** si hay opciones que dependen de algo ya
elegido, se muestran **solo esas**; si no, se muestran las que tienen
`depende_de: null`. (Así una versión de torta con toppings propios reemplaza la
lista general.)

**Precio del ítem** = `precio_base` del producto + opciones fijas + opciones
por kg × peso. Un producto sin pasos se vende a `precio_base`.

> **Recomendación:** no repliques estas reglas en el POS. Llamá a `/cotizar`
> cada vez que el cliente toca una opción: devuelve, por cada paso, qué
> opciones mostrar (`opciones_visibles`), el precio y los errores.

---

## GET /catalogo

Mandá `If-None-Match` con la versión que tenés guardada: si el catálogo no
cambió responde **304** sin cuerpo. La versión viene en `data.version` y en el
header `ETag`.

```
GET /catalogo
If-None-Match: "97a1da71b463"
```

Respuesta 200 (recortada a un producto):

```json
{
  "success": true,
  "data": {
    "version": "97a1da71b463",
    "productos": [
      {
        "id": 6,
        "nombre": "Tortas",
        "descripcion": null,
        "categoria": "Dulzuras fit",
        "imagen": null,
        "emoji": null,
        "etiquetas": ["ALTO EN FIBRA", "SIN AZUCAR", "SIN GLUTEN"],
        "es_congelado": false,
        "precio_base": 0,
        "precio_desde": 32500,
        "pasos": [
          {
            "id": 5, "nombre": "Versión", "min_sel": 1, "max_sel": 1,
            "opciones": [
              { "id": 27, "nombre": "Bruce", "descripcion": "100% de harina de castaña de caju...",
                "precio": 32000, "precio_modo": "por_kg", "peso_kg": null, "depende_de": null,
                "etiquetas": ["SIN AZUCAR", "SIN GLUTEN"], "imagen": "https://..." }
            ]
          },
          {
            "id": 6, "nombre": "Tamaño", "min_sel": 1, "max_sel": 1,
            "opciones": [
              { "id": 34, "nombre": "Chico",   "precio": 0, "precio_modo": "fijo", "peso_kg": 1.7, "depende_de": 27, "descripcion": null, "etiquetas": [], "imagen": null },
              { "id": 35, "nombre": "Mediano", "precio": 0, "precio_modo": "fijo", "peso_kg": 1.9, "depende_de": 27, "descripcion": null, "etiquetas": [], "imagen": null },
              { "id": 36, "nombre": "Grande",  "precio": 0, "precio_modo": "fijo", "peso_kg": 2.5, "depende_de": 27, "descripcion": null, "etiquetas": [], "imagen": null }
            ]
          },
          {
            "id": 7, "nombre": "Toppings", "min_sel": 0, "max_sel": 3,
            "opciones": [
              { "id": 39, "nombre": "Franui pote x300G", "descripcion": "300 g", "precio": 8000,
                "precio_modo": "fijo", "peso_kg": null, "depende_de": 24, "etiquetas": [], "imagen": null }
            ]
          }
        ]
      }
    ]
  }
}
```

- Solo vienen productos y opciones **activos**.
- `precio_desde`: la combinación obligatoria más barata (para mostrar "desde $X").
- `imagen` puede ser `null` o una URL absoluta.

---

## POST /cotizar

Calcula sin guardar. `opciones` es la lista **plana** de ids elegidos (de
todos los pasos); el servidor ubica cada una en su paso.

```json
{ "items": [ { "producto_id": 6, "opciones": [27, 36], "cantidad": 2, "notas": "Feliz cumple" } ] }
```

Respuesta (pedido válido):

```json
{
  "success": true,
  "data": {
    "ok": true,
    "total": 160000,
    "version": "97a1da71b463",
    "errores": [],
    "items": [
      {
        "producto_id": 6, "cantidad": 2, "notas": "Feliz cumple", "nombre": "Tortas",
        "peso_kg": 2.5, "precio_unitario": 80000,
        "pasos": [
          { "paso_id": 5, "nombre": "Versión",  "min_sel": 1, "max_sel": 1, "opciones_visibles": [23,24,25,26,27,28,29], "elegidas": [27] },
          { "paso_id": 6, "nombre": "Tamaño",   "min_sel": 1, "max_sel": 1, "opciones_visibles": [34,35,36], "elegidas": [36] },
          { "paso_id": 7, "nombre": "Toppings", "min_sel": 0, "max_sel": 3, "opciones_visibles": [], "elegidas": [] }
        ],
        "errores": [],
        "opciones": [
          { "opcion_id": 27, "paso_id": 5, "paso_nombre": "Versión", "nombre": "Bruce",  "precio": 80000 },
          { "opcion_id": 36, "paso_id": 6, "paso_nombre": "Tamaño",  "nombre": "Grande", "precio": 0 }
        ]
      }
    ]
  }
}
```

Respuesta con falta de algo (sigue siendo HTTP 200; mirar `ok`):

```json
{
  "success": true,
  "data": {
    "ok": false, "total": 0, "errores": [],
    "items": [
      {
        "producto_id": 6, "nombre": "Tortas", "precio_unitario": 0, "peso_kg": null,
        "pasos": [ "...igual que arriba, con elegidas: [] en Tamaño..." ],
        "errores": [ { "paso_id": 6, "mensaje": "Falta elegir: Tamaño" } ],
        "opciones": [ { "opcion_id": 27, "paso_id": 5, "paso_nombre": "Versión", "nombre": "Bruce", "precio": 0 } ]
      }
    ]
  }
}
```

- `ok: true` = se puede crear el pedido tal cual.
- `total` suma solo los ítems sin errores.
- Cada error trae `paso_id` (o `null` si es del ítem) y un `mensaje` listo para mostrar.
- `pasos[].opciones_visibles` vacío = ese paso no se muestra con lo elegido.
- Si el producto no existe o está inactivo, el ítem viene solo con
  `errores: [{ "mensaje": "Producto no disponible" }]`.
- Límites: hasta **50 ítems** por pedido, `cantidad` de **1 a 99** (por defecto 1).

**Cómo armar la pantalla del POS:**
1. Mostrar los pasos del catálogo.
2. Con cada toque, llamar a `/cotizar` con lo elegido.
3. Dibujar solo las opciones de `opciones_visibles` y marcar `elegidas`.
4. Si se cambia una opción de la que dependen otras (ej. la versión), sacar de
   la selección las que dependían de la anterior (`depende_de`).
5. Habilitar "agregar" cuando el ítem no tenga `errores`.

---

## POST /pedidos  (requiere `X-API-Key`)

```json
{
  "ref_externa": "VENTA-1532",
  "cliente_nombre": "Ana",
  "cliente_telefono": "3704000000",
  "fecha_entrega": "2026-10-10T16:00:00-03:00",
  "notas": "Retira la hermana",
  "items": [
    { "producto_id": 6, "opciones": [27, 36], "cantidad": 1, "notas": "Feliz cumple" }
  ]
}
```

| Campo | | |
|---|---|---|
| `ref_externa` | **obligatorio** | Id de la venta en el POS (texto, hasta 80). Evita duplicados. |
| `items` | **obligatorio** | Igual que en `/cotizar`. |
| `cliente_nombre`, `cliente_telefono`, `notas` | opcional | Texto. |
| `fecha_entrega` | opcional | Fecha ISO 8601. |
| `origen` | opcional | `"pos"` (por defecto) o `"web"`. |

Respuesta **201** (creado) o **200** (ya existía con ese `ref_externa`):

```json
{
  "success": true,
  "data": {
    "numero": "PP-20261010-0001",
    "origen": "pos",
    "ref_externa": "VENTA-1532",
    "estado": "pendiente",
    "cliente_nombre": "Ana",
    "cliente_telefono": "3704000000",
    "fecha_entrega": "2026-10-10T19:00:00.000Z",
    "notas": "Retira la hermana",
    "total": 80000,
    "creado": "2026-10-06T15:20:11.000Z",
    "duplicado": false,
    "items": [
      {
        "producto_id": 6, "nombre": "Tortas", "cantidad": 1, "precio_unitario": 80000,
        "peso_kg": 2.5, "notas": "Feliz cumple",
        "opciones": [
          { "opcion_id": 27, "paso": "Versión", "nombre": "Bruce",  "precio": 80000 },
          { "opcion_id": 36, "paso": "Tamaño",  "nombre": "Grande", "precio": 0 }
        ]
      }
    ]
  }
}
```

- **Idempotencia:** si el POS reintenta (timeout, corte de red) con el mismo
  `ref_externa`, recibe el mismo pedido con `duplicado: true` y **no se crea
  otro**. Reintentar siempre con el mismo `ref_externa` es seguro.
- **`numero`** es el identificador del pedido para las demás rutas.
- **El total que vale es el de la respuesta.** Si el catálogo cambió entre la
  cotización y la creación, se cobra el precio vigente.
- El pedido queda guardado con los precios del momento: no cambia aunque
  después cambien los precios.

Errores:

| HTTP | Cuándo |
|---|---|
| 400 | Falta `ref_externa`, fecha inválida |
| 401 | Clave incorrecta (`"Clave invalida"`) |
| 422 | El pedido no cumple las reglas: trae `cotizacion` con los errores de cada paso |
| 503 | La clave no está configurada en el servidor |

```json
{ "success": false, "message": "El pedido tiene errores", "cotizacion": { "ok": false, "items": [ "...como en /cotizar..." ] } }
```

---

## GET /pedidos/:numero  (requiere `X-API-Key`)

Devuelve el pedido con la misma forma que la respuesta de `POST /pedidos`
(sin `duplicado`). 404 si no existe.

## PATCH /pedidos/:numero/estado  (requiere `X-API-Key`)

```json
{ "estado": "entregado" }
```

Respuesta: `{ "success": true, "data": { "numero": "PP-20261010-0001", "estado": "entregado" } }`

Estados y transiciones permitidas:

| Desde | Puede pasar a |
|---|---|
| `pendiente` | `en_produccion`, `cancelado` |
| `en_produccion` | `pendiente`, `listo`, `cancelado` |
| `listo` | `en_produccion`, `entregado`, `cancelado` |
| `entregado` | — (final) |
| `cancelado` | `pendiente` |

Una transición no permitida responde **409**. Pasar al mismo estado en el que
ya está no es error. Si se anula la venta en el POS, mandar `cancelado`.

---

## Qué queda en cada sistema

- **CoffitCost:** catálogo, precios, reglas, costos y el pedido (para producción
  y para medir food cost real).
- **POS:** cobro, seña, medios de pago, descuentos de caja y facturación.
