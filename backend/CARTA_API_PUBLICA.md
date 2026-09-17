# API pública de la Carta digital

Reemplaza al Google Sheets. Es **read-only**, **CORS abierto** (se puede consumir
desde cualquier dominio) y expone **solo campos de menú**: nunca costo,
rentabilidad ni el mapeo interno a productos. Los ítems con "Desactivar" tildado
no aparecen.

**Base URL (producción):** `https://coffitcost.saboryaroma.com/api/public/carta`

La data sale en vivo de la sección **Carta** del panel. Cualquier cambio ahí
(precio, descripción, activar/desactivar, etc.) se refleja al instante.

> **Nota de unificación:** si un ítem está vinculado a un **producto**, el `nombre`,
> la `categoria` y el `precio` se **heredan del producto**. Si está vinculado a una
> **promo** (combos tipo Box), hereda el **nombre y el precio del combo** (precio
> especial). El menú recibe el valor final ya resuelto — no tenés que hacer nada
> distinto. Editar el producto o la promo actualiza el menú automáticamente.

---

## Endpoints

### 1) `GET /api/public/carta`
Lista plana del menú + categorías ordenadas.

**Query params (todos opcionales):**
- `categoria` — filtra por categoría exacta. Ej: `?categoria=Bebidas`
  **Incluye todas sus subcategorías.**
- `subcategoria` — filtra por subcategoría. Ej: `?categoria=Dulces&subcategoria=Fit`
  ⚠️ Usar **siempre junto con `categoria`**: los nombres de subcategoría pueden
  repetirse entre categorías distintas (`Dulces › Fit` y `Salados › Fit`).
- `destacados` — `1` para solo destacados. Ej: `?destacados=1`
- `nuevos` — `1` para solo los "nuevos". Ej: `?nuevos=1`
- `buscar` — busca por nombre. Ej: `?buscar=latte`

**Respuesta:**
```json
{
  "actualizado": "2026-06-26T12:00:00.000Z",
  "total": 98,
  "categorias": ["Cafes De Especialidad", "Licuados A Pura Fruta", "..."],
  "items": [
    {
      "id": 1,
      "nombre": "Latte saborizado",
      "precio": 4200,
      "precio_texto": "4.200,00",
      "categoria": "Cafes De Especialidad",
      "subcategoria": null,
      "etiquetas": ["SIN LACTOSA"],
      "descripcion": "...",
      "imagen": "https://saboryaroma.com/imagenescoffit/latte.jpg",
      "frio_caliente": false,
      "tamanos": [
        { "nombre": "500ml", "precio": 5000, "precio_texto": "5.000,00" }
      ],
      "sabores": [
        { "nombre": "Pistacho", "precio": 4200, "precio_texto": "4.200,00", "es_nuevo": true },
        { "nombre": "Caramelo", "precio": 4200, "precio_texto": "4.200,00", "es_nuevo": false }
      ],
      "toppings": [
        { "nombre": "Con maple syrup", "precio_extra": 1000, "precio_extra_texto": "1.000,00" }
      ],
      "destacado": false,
      "es_nuevo": true,
      "fecha_lanzamiento": "2026-06-01"
    }
  ]
}
```

**Notas sobre variantes:**
- `tamanos` y `sabores` traen el **precio final ya resuelto** (si en el panel se dejó vacío, hereda el precio base del item — acá ya viene calculado).
- `toppings` traen `precio_extra` = lo que se **suma** al precio (aditivo).
- `sabores[].es_nuevo` = ese sabor está dentro de la ventana de días nuevos.
- `es_nuevo` (item) = lanzado hace ≤ N días **o** tiene algún sabor nuevo. La ventana N es configurable (default 45) en Configuración (`dias_nuevo_carta`).

### 2) `GET /api/public/carta/agrupado`
Mismo menú pero ya agrupado por categoría (para renderizar secciones directo).
Acepta los mismos query params.

```json
{
  "actualizado": "2026-06-26T12:00:00.000Z",
  "total": 98,
  "categorias": [
    {
      "categoria": "Cafes De Especialidad",
      "items": [ { "id": 1, "nombre": "Americano", "...": "..." } ],
      "subcategorias": [],
      "sin_subcategoria": [ { "id": 1, "nombre": "Americano", "...": "..." } ]
    },
    {
      "categoria": "Dulces",
      "items": [ /* TODOS los de Dulces: Fit + Fat + los sueltos */ ],
      "subcategorias": [
        { "subcategoria": "Fit", "items": [ /* ... */ ] },
        { "subcategoria": "Fat", "items": [ /* ... */ ] }
      ],
      "sin_subcategoria": [ /* los que cuelgan directo de Dulces */ ]
    }
  ]
}
```

> **`items` no cambió:** sigue trayendo **todos** los ítems de la categoría,
> incluidos los que están dentro de subcategorías. Una app que solo lee `items`
> funciona **exactamente igual que antes**. `subcategorias` y `sin_subcategoria`
> son campos **nuevos y opcionales**: si la categoría no usa subcategorías,
> `subcategorias` viene `[]` y `sin_subcategoria` es igual a `items`.

### 3) `GET /api/public/carta/nuevos`
Solo los items "nuevos" (para la sección **"Ver lo nuevo"**). Misma forma de item.

```json
{ "actualizado": "...", "total": 3, "items": [ /* solo es_nuevo=true */ ] }
```

### 4) `GET /api/public/carta/categorias`
Solo las categorías activas (para armar tabs/menú de navegación).

```json
[
  { "categoria": "Cafes De Especialidad", "cantidad": 24, "subcategorias": [] },
  { "categoria": "Dulces", "cantidad": 14, "subcategorias": [
      { "subcategoria": "Fit", "cantidad": 6 },
      { "subcategoria": "Fat", "cantidad": 5 }
  ] },
  { "categoria": "Bebidas", "cantidad": 9, "subcategorias": [] }
]
```

> `cantidad` de la categoría es el **total incluyendo sus subcategorías**
> (6 Fit + 5 Fat + 3 sueltos = 14). `subcategorias` es un campo nuevo: viene
> `[]` cuando la categoría no usa subcategorías.

---

## Campos de cada ítem

| Campo               | Tipo      | Notas                                            |
|---------------------|-----------|--------------------------------------------------|
| `id`                | number    | id interno estable                               |
| `nombre`            | string    |                                                  |
| `precio`            | number    | para cálculos                                    |
| `precio_texto`      | string    | formato AR listo para mostrar: `"4.500,00"`      |
| `categoria`         | string    | **siempre la categoría principal (raíz)**        |
| `subcategoria`      | string\|null | subcategoría del ítem, `null` si no tiene     |
| `etiquetas`         | string[]  | `"SIN AZUCAR, SIN GLUTEN"` → `["SIN AZUCAR","SIN GLUTEN"]` |
| `descripcion`       | string    |                                                  |
| `imagen`            | string    | URL (puede venir vacía)                          |
| `frio_caliente`     | boolean   | se puede pedir frío o caliente                   |
| `tamanos`           | object[]  | `{nombre, precio, precio_texto}` (precio final)  |
| `sabores`           | object[]  | `{nombre, precio, precio_texto, es_nuevo}`       |
| `toppings`          | object[]  | `{nombre, precio_extra, precio_extra_texto}`     |
| `destacado`         | boolean   |                                                  |
| `adiciones`         | object[]  | `{nombre, precio_extra, precio_extra_texto}` — agregados opcionales (ej: "+ panceta"), precio en vivo desde Productos |
| `es_combo`          | boolean   | `true` si el item es un box/combo (vinculado a una promo) |
| `incluye`           | object[]  | composición del box: `{nombre, cantidad, es_regalo}` (vacío si no es combo; `es_regalo: true` = producto de regalo 🎁 en promos Compra+Regalo) |
| `es_nuevo`          | boolean   | item nuevo (≤N días) o con algún sabor nuevo     |
| `fecha_lanzamiento` | string    | `"YYYY-MM-DD"` o `null`                          |

> **Boxs/combos:** un item vinculado a una promo solo aparece en el menú mientras la
> promo esté **activa**. Si la promo vence o se pausa, el item desaparece
> automáticamente de todas las respuestas. `incluye` sale en vivo de la promo:
> si cambia el armado del box, el menú lo refleja sin tocar nada.
>
> **Categoría de los combos:** la `categoria` de un item vinculado a promo la define
> la promo misma y es una de tres fijas: **"Promo"**, **"Combo"** o **"Boxs"**.
> Cambiarla en el panel (Promos/Boxs) recategoriza el item en el menú al instante,
> y `/categorias` la lista automáticamente.

---

## Subcategorías (novedad)

Las categorías pueden tener **subcategorías**, con una jerarquía de **2 niveles**:

```
Dulces          <- categoria  (campo `categoria`)
  ├─ Fit        <- subcategoria (campo `subcategoria`)
  └─ Fat
```

**Reglas que garantizan que nada se rompa:**

1. **`categoria` siempre es la raíz.** Nunca va a llegar `"Fit"` en `categoria`.
   Un producto que pasa a `Dulces › Fit` sigue reportando `categoria: "Dulces"`.
2. **Es opcional en los dos sentidos.** Una categoría puede no tener
   subcategorías, y un ítem puede quedarse colgando de la raíz
   (`subcategoria: null`). Todo lo que existía hoy sigue con `subcategoria: null`.
3. **Todo lo nuevo es aditivo.** No se sacó ni se renombró ningún campo. La app
   actual puede seguir funcionando sin tocar una línea.
4. **Se hereda en vivo.** Si el ítem está mapeado a un producto, la subcategoría
   sale del producto; si está mapeado a una promo, de la promo. Cambiarlo en el
   panel se refleja al instante.

**Qué hay que cambiar en la app del menú (opcional, cuando quieras):**

| Si querés… | Usá |
|---|---|
| Nada, dejarlo como está | Ya funciona. `items` de `/agrupado` trae todo plano |
| Sub-secciones dentro de la categoría | `categorias[].subcategorias[]` + `sin_subcategoria[]` |
| Chips "Todo / Fit / Fat" arriba de la categoría | `/categorias` → `subcategorias[]`, y filtrar en cliente por `item.subcategoria` |
| Traer solo una subcategoría del server | `?categoria=Dulces&subcategoria=Fit` |

**Orden sugerido para renderizar una categoría:** primero `sin_subcategoria`,
después cada bloque de `subcategorias` en el orden que viene.

---

## Ejemplo de consumo (JS / fetch)

```js
const res = await fetch('https://coffitcost.saboryaroma.com/api/public/carta/agrupado');
const { categorias } = await res.json();
categorias.forEach((cat) => {
  console.log(cat.categoria);
  cat.items.forEach((item) => console.log('  ', item.nombre, item.precio_texto));
});
```

> No requiere API key ni auth. Es público y solo lectura.
