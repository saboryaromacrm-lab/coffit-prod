-- ============================================================================
-- GRUPOS DE OPCIONES (genericos) en items de carta
--
-- Para elecciones de menu que no encajan en tamaño/sabor/topping/temperatura:
-- ej "Tipo de huevo" con las alternativas "Huevos enteros" / "Clara de huevo".
-- No hay una columna fija por tipo de eleccion: el nombre del grupo y sus
-- opciones se cargan libremente desde el editor de Carta, para cualquier
-- producto (tipo de pan, tipo de leche, nivel de picante, lo que haga falta).
--
-- Formato: [{ "nombre": "Tipo de huevo", "opciones": [
--   { "nombre": "Huevos enteros", "precio": null },
--   { "nombre": "Clara de huevo", "precio": null }
-- ] }]
--   precio null = cobra el precio base del item (eleccion sin cargo extra)
--   precio 4500 = esa opcion vale 4500 (el menu muestra la diferencia)
--
-- Cada grupo es de SELECCION UNICA: el cliente elige una alternativa del
-- grupo, no se combinan (a diferencia de toppings/adiciones que se suman).
-- Es solo una eleccion de menu: no cambia el costo/receta del producto.
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

ALTER TABLE carta_items
  ADD COLUMN grupos_opciones TEXT NULL AFTER temperaturas;
