-- ============================================================================
-- SUBCATEGORIAS DE PRODUCTO (jerarquia de 2 niveles)
--
--   Dulces            <- categoria RAIZ  (parent_id = NULL)
--     |- Fit          <- subcategoria    (parent_id = id de "Dulces")
--     |- Fat          <- subcategoria
--
-- IDEA CLAVE: una subcategoria es una FILA MAS de categorias_productos, con
-- parent_id apuntando a su padre. `productos.categoria_id` sigue apuntando a
-- UNA sola fila (la raiz si el producto no tiene subcategoria, o la hija si la
-- tiene). Por eso NO hay que tocar la tabla productos ni migrar datos: todo lo
-- que existe hoy queda exactamente igual (parent_id = NULL).
--
-- REGLA DE ORO (aplicada en todo el backend): "categoria" significa SIEMPRE la
-- RAIZ. La hoja se expone aparte como "subcategoria" (NULL si no tiene). Asi
-- ningun reporte ni agrupacion cambia de resultado al crear subcategorias.
--
-- Profundidad maxima: 2 niveles. El backend lo valida (una subcategoria no
-- puede tener hijas). No hace falta CTE recursivo -> compatible con MySQL 5.7.
--
-- Ejecutar UNA SOLA VEZ en phpMyAdmin, SELECCIONANDO LA BASE PRIMERO.
-- ============================================================================

-- 1) Jerarquia de categorias de producto -------------------------------------
ALTER TABLE categorias_productos
  ADD COLUMN parent_id INT NULL DEFAULT NULL AFTER nombre,
  ADD INDEX idx_categorias_parent (parent_id);

-- 2) Subcategoria de los items de carta SIN mapear ---------------------------
-- Los items mapeados a un producto heredan la subcategoria del producto en
-- vivo (no se guarda). Esta columna es solo para los items sueltos.
ALTER TABLE carta_items
  ADD COLUMN subcategoria VARCHAR(60) NULL DEFAULT NULL AFTER categoria;

-- 3) Subcategoria de las promos (Promo/Combo/Boxs) ---------------------------
-- Preparada para el dia que quieras partir esas 3 secciones (ej: "Boxs > Para
-- regalar"). Queda vacia; el backend ya la lee y la guarda, solo falta mostrar
-- el campo en el editor de Promos cuando la quieras usar.
ALTER TABLE ofertas
  ADD COLUMN subcategoria_carta VARCHAR(60) NULL DEFAULT NULL AFTER categoria_carta;

-- ============================================================================
-- VERIFICACION (opcional): deberia devolver todo con parent_id = NULL
-- SELECT id, nombre, parent_id FROM categorias_productos WHERE activo = 1 ORDER BY orden;
-- ============================================================================
