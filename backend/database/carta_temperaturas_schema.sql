-- ============================================================================
-- TEMPERATURAS (frio / caliente) CON PRECIO en items de carta
--
-- Antes `frio_caliente` era solo un booleano: el item se podia pedir frio o
-- caliente, siempre al mismo precio. Ahora cada temperatura es una opcion con
-- precio propio, igual que los tamaños:
--   [{ "nombre": "Frío", "precio": null }, { "nombre": "Caliente", "precio": 3200 }]
--     precio null  = cobra el precio base del item (sin cargo)
--     precio 3200  = esa temperatura vale 3200 (el menu muestra la diferencia)
--
-- No hace falta migrar datos: los items que hoy tienen frio_caliente = 1 y la
-- columna vacia devuelven automaticamente Frío y Caliente al precio base (o
-- sea, exactamente lo que hacen hoy) y se persisten solo cuando se los guarda.
-- La columna `frio_caliente` se mantiene y pasa a ser una bandera DERIVADA
-- (1 = el item tiene al menos una temperatura), asi la API publica no rompe a
-- la app del menu que ya la consume.
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN temperaturas TEXT NULL AFTER frio_caliente;
