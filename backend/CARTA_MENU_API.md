# API de la carta para la app del menú

Solo lectura y pública (sin clave). La app del menú arma con esto la carta y el precio que paga el cliente.

**URL base:** `https://apicoffit.saboryaroma.com/api/public/carta`

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/` | `{ actualizado, total, categorias: [nombres], items: [item] }`. Filtros opcionales: `?categoria=` `?destacados=1` `?nuevos=1` `?buscar=` |
| GET | `/agrupado` | `{ actualizado, total, categorias: [{ categoria, items, subcategorias: [{ subcategoria, items }], sin_subcategoria }] }` |
| GET | `/nuevos` | `{ actualizado, total, items }`: solo los nuevos |
| GET | `/categorias` | `[{ categoria, cantidad, subcategorias: [{ subcategoria, cantidad }] }]` |

Los items pausados no aparecen, y las promos/boxs aparecen solo si la promo está activa.

## Cómo se calcula el precio (regla única)

```
precio final = precio del TAMAÑO elegido (o item.precio si el item no tiene tamaños)
             + precio_extra del sabor elegido
             + precio_extra de la temperatura elegida
             + precio_extra de la opción elegida en CADA grupo de opciones
             + precio_extra de cada topping marcado
             + precio_extra de cada adición marcada
```

- El tamaño es el único con precio **total**. Todo lo demás **suma** su `precio_extra`.
- `precio_extra` puede ser `0` (sin cargo, `es_base: true`) o negativo (más barato).
- Usá siempre `precio_extra` para sumar. El campo `precio` de sabores, temperaturas y opciones (= `item.precio + precio_extra`) existe solo por compatibilidad. No lo uses como precio final si el item tiene tamaños.

## Orden en que el cliente elige

`item.orden_opciones` trae las listas que tiene el item, en el orden en que se muestran. Las listas vacías no se incluyen. El orden completo es:

1. `tamanos`: elige 1. Fija el precio.
2. `sabores`: elige 1.
3. `temperaturas`: elige 1 (Frío / Caliente).
4. `grupos_opciones`: elige 1 opción de **cada** grupo (ej. "Tipo de huevo").
5. `toppings`: puede marcar varios.
6. `adiciones`: puede marcar varias.

Conviene mostrar el precio armándose a medida que elige ("Grande $6.000 · Caliente +$500 · Total $6.500").

## Opciones limitadas a un tamaño (`solo_tamanos`)

Sabores, temperaturas y opciones de grupo traen `solo_tamanos`: los nombres de los tamaños en que se ofrecen.

- `[]` → se ofrece en todos los tamaños.
- `["Estándar"]` → solo con el tamaño Estándar (ej. el Frío).

Cómo manejarlo en la app:
- Si el cliente eligió un tamaño que no está en `solo_tamanos` de una opción, mostrá esa opción **deshabilitada**, con la nota "solo en Estándar".
- Si ya eligió una opción limitada (ej. Frío), deshabilitá los tamaños que no están en su `solo_tamanos`.
- Si cambia el tamaño y la opción elegida deja de valer, deseleccionala.
- Si el item no tiene tamaños, ignorá `solo_tamanos`.

## Forma de un item

```jsonc
{
  "id": 11,
  "nombre": "Latte golden milk",
  "precio": 6000,                 // precio base (se usa si el item no tiene tamaños)
  "precio_texto": "6.000,00",
  "categoria": "Cafetería",
  "subcategoria": null,
  "etiquetas": ["SIN AZUCAR"],
  "descripcion": "",
  "imagen": "https://...",
  "frio_caliente": true,          // compat: true si tiene temperaturas
  "tamanos":      [{ "nombre": "Estándar", "precio": 5500, "precio_texto": "5.500,00" }],
  "sabores":      [ /* eleccion + "es_nuevo": bool */ ],
  "temperaturas": [ /* eleccion */ ],
  "grupos_opciones": [{ "nombre": "Tipo de huevo", "opciones": [ /* eleccion */ ] }],
  "toppings":     [{ "nombre": "Maple", "precio_extra": 500, "precio_extra_texto": "500,00" }],
  "adiciones":    [{ "nombre": "Palta", "precio_extra": 1500, "precio_extra_texto": "1.500,00" }],
  "orden_opciones": ["tamanos", "temperaturas"],
  "es_combo": false,
  "incluye": [],                  // composición si es promo/box: [{ nombre, cantidad, es_regalo }]
  "destacado": false,
  "es_nuevo": false,
  "fecha_lanzamiento": "2026-09-01"
}
```

**eleccion** (sabor, temperatura u opción de grupo):

```jsonc
{
  "nombre": "Caliente",
  "precio_extra": 500,            // lo que suma (0 = sin cargo, negativo = más barato)
  "precio_extra_texto": "+500,00",// "" si es 0; "−500,00" si es negativo
  "es_base": false,               // true si precio_extra es 0
  "solo_tamanos": [],             // [] = todos los tamaños
  "precio": 6500,                 // compat: item.precio + precio_extra
  "precio_texto": "6.500,00"
}
```

Los textos (`*_texto`) vienen formateados en es-AR, sin el signo `$`.

## Ejemplos reales (producción)

**Latte golden milk**: tiene tamaños y el Frío va solo en Estándar. Estándar frío = $5.500, Estándar caliente = $5.500, Grande caliente = $6.000. Grande frío no se puede elegir.

```json
{
 "id": 11,
 "nombre": "Latte golden milk",
 "precio": 6000,
 "precio_texto": "6.000,00",
 "categoria": "Cafes De Especialidad",
 "subcategoria": null,
 "etiquetas": [],
 "descripcion": "Salud en una taza. Cúrcuma pura ..",
 "imagen": "https://saboryaroma.com/imagenescoffit/golden.jpg",
 "frio_caliente": true,
 "tamanos": [
  {
   "nombre": "Estándar",
   "precio": 5500,
   "precio_texto": "5.500,00"
  },
  {
   "nombre": "Grande",
   "precio": 6000,
   "precio_texto": "6.000,00"
  }
 ],
 "sabores": [],
 "temperaturas": [
  {
   "nombre": "Frío",
   "precio_extra": 0,
   "precio_extra_texto": "",
   "es_base": true,
   "solo_tamanos": [
    "Estándar"
   ],
   "precio": 6000,
   "precio_texto": "6.000,00"
  },
  {
   "nombre": "Caliente",
   "precio_extra": 0,
   "precio_extra_texto": "",
   "es_base": true,
   "solo_tamanos": [],
   "precio": 6000,
   "precio_texto": "6.000,00"
  }
 ],
 "grupos_opciones": [],
 "toppings": [],
 "adiciones": [],
 "orden_opciones": [
  "tamanos",
  "temperaturas"
 ],
 "es_combo": false,
 "incluye": [],
 "destacado": false,
 "es_nuevo": false,
 "fecha_lanzamiento": null
}
```

**Triple tostado de jamón y queso**: no tiene tamaños, así que el precio parte del base. Frío = $4.500, Caliente = $4.500 + $700 = $5.200.

```json
{
 "id": 68,
 "nombre": "Triple tostado de jamon y queso",
 "precio": 4500,
 "precio_texto": "4.500,00",
 "categoria": "Salados",
 "subcategoria": "Clasicos",
 "etiquetas": [],
 "descripcion": "Jamon, queso, y mayonesa tostados con manteca.",
 "imagen": "https://saboryaroma.com/imagenescoffit/triplejyq.jpg",
 "frio_caliente": true,
 "tamanos": [],
 "sabores": [],
 "temperaturas": [
  {
   "nombre": "Frío",
   "precio_extra": 0,
   "precio_extra_texto": "",
   "es_base": true,
   "solo_tamanos": [],
   "precio": 4500,
   "precio_texto": "4.500,00"
  },
  {
   "nombre": "Caliente",
   "precio_extra": 700,
   "precio_extra_texto": "+700,00",
   "es_base": false,
   "solo_tamanos": [],
   "precio": 5200,
   "precio_texto": "5.200,00"
  }
 ],
 "grupos_opciones": [],
 "toppings": [],
 "adiciones": [],
 "orden_opciones": [
  "temperaturas"
 ],
 "es_combo": false,
 "incluye": [],
 "destacado": false,
 "es_nuevo": false,
 "fecha_lanzamiento": null
}
```
