# Costos de ingredientes: ERP Sabor y Aroma → CoffitCost

El ERP de Sabor y Aroma le **empuja** a CoffitCost el costo de sus artículos.
CoffitCost actualiza el costo de cada ingrediente y recalcula solo todas las
subrecetas y productos que lo usan.

- **URL:** `POST https://apicoffit.saboryaroma.com/api/public/sya/costos`
- **Clave:** header `X-API-Key: <clave>`. Llamarlo **solo desde el servidor del
  ERP** (nunca desde un navegador: no tiene CORS abierto).
- **Formato:** JSON. Respuesta `{ "success": true, "data": ... }` o
  `{ "success": false, "message": "..." }`.

## Qué mandar

```json
{
  "fecha": "2026-10-06T10:00:00-03:00",
  "referencia": "LISTA-0153",
  "costos": [
    { "nombre": "Harina de almendras", "costo": 12000, "unidad": "kg" },
    { "nombre": "Huevo",               "costo": 2400,  "unidad": "doc" },
    { "nombre": "Dulce de leche sin azucar trini", "costo": 11.74, "unidad": "g" }
  ]
}
```

| Campo | | |
|---|---|---|
| `fecha` | **obligatorio** | Fecha ISO 8601 del costo (cuándo rige). |
| `referencia` | opcional | Texto corto (hasta 20) para identificar el envío. Queda como marca en el ingrediente. Por defecto `LISTA`. |
| `costos` | **obligatorio** | Lista de 1 a 2000 renglones. |
| `costos[].nombre` | **obligatorio** | Nombre **exacto** del ingrediente en CoffitCost. |
| `costos[].costo` | **obligatorio** | Costo **por 1 unidad** de `unidad`, ya calculado, sin desperdicio. Número > 0. |
| `costos[].unidad` | **obligatorio** | `g`, `kg`, `ml`, `l`, `u` o `doc`. |

### El nombre

Tiene que ser el mismo que en CoffitCost. Se ignoran mayúsculas, tildes y
espacios de más (`" harina DE Almendras "` = `"Harina de almendras"`), pero
**nada más**: `"Franui pote x150G"` y `"Franui pote x300G"` son distintos. La
lista de nombres de CoffitCost está en
`GET https://apicoffit.saboryaroma.com/api/public/ingredientes`.

### La unidad

Mandá el costo en la unidad que te resulte cómoda: CoffitCost lo convierte a la
unidad del ingrediente dentro de la misma familia:

| Familia | Unidades |
|---|---|
| Peso | `g`, `kg` (1 kg = 1000 g) |
| Volumen | `ml`, `l` (1 l = 1000 ml) |
| Unidades | `u`, `doc` (1 doc = 12 u) |

Ej.: `12000` por `kg` en un ingrediente en gramos → $12 por g. Si las familias
no coinciden (kg contra un ingrediente por unidad) ese renglón **no se aplica**
y vuelve en `unidad_incompatible`.

### El desperdicio

**No** lo incluyas: mandá el costo puro. CoffitCost le suma el desperdicio que
tiene cargado cada ingrediente.

## Qué responde

Siempre HTTP 200 si la lista es válida, con el resultado de **cada** renglón:

```json
{
  "success": true,
  "data": {
    "fecha": "2026-10-06",
    "recibidos": 6,
    "actualizados": [
      { "ingrediente_id": 41, "nombre": "Harina de almendras", "unidad": "g", "costo_anterior": 10.5, "costo_nuevo": 12 }
    ],
    "sin_cambios": ["Huevo"],
    "mas_viejos": [],
    "no_encontrados": ["Harina de almendra fina"],
    "ambiguos": [],
    "unidad_incompatible": [{ "nombre": "Huevo", "unidad_enviada": "kg", "unidad_ingrediente": "u" }],
    "invalidos": [{ "indice": 4, "nombre": "Azucar", "motivo": "costo tiene que ser un numero mayor a 0" }]
  }
}
```

| Lista | Qué significa | Qué hacer |
|---|---|---|
| `actualizados` | Se aplicó y se recalcularon subrecetas y productos. | Nada. |
| `sin_cambios` | Ya tenía ese mismo costo. | Nada. |
| `mas_viejos` | CoffitCost ya tiene un costo de Sabor y Aroma con fecha **posterior**: no se pisa. | Nada (es la protección contra datos viejos). |
| `no_encontrados` | Ningún ingrediente se llama así. | **Revisar el nombre.** |
| `ambiguos` | Más de un ingrediente con ese nombre. | Avisar a Coffit para que lo desambigüe. |
| `unidad_incompatible` | La unidad no es de la misma familia que la del ingrediente. | Mandar en otra unidad. |
| `invalidos` | Renglón mal formado o repetido en el mismo envío (`indice` = posición en `costos`). | Corregir. |

**Mostrá o registrá `no_encontrados`, `ambiguos`, `unidad_incompatible` e
`invalidos`**: es la única forma de enterarse de que un costo no entró.

Errores de la lista entera:

| HTTP | Cuándo |
|---|---|
| 400 | Falta `fecha`, `costos` vacío o con más de 2000 renglones |
| 401 | Clave incorrecta |
| 503 | La clave no está configurada en CoffitCost |

## Reglas

- **Reenviar es seguro:** mandar la misma lista dos veces no cambia nada.
- **Nunca retrocede:** un costo con `fecha` anterior al último que aplicó Sabor
  y Aroma en ese ingrediente se ignora (va a `mas_viejos`). Es la misma regla
  que el import de envíos.
- **Todo o nada:** la lista se aplica en una sola transacción.
- En el ingrediente queda Sabor y Aroma como proveedor 1 (si había otro, pasa
  al proveedor 2) con la fecha y la referencia del envío.
- Se puede mandar la lista completa cada vez o solo lo que cambió.
