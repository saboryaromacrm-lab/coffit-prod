-- Pedidos personalizados: el producto se pide con anticipacion (si/no).
-- Solo la marca, sin horarios: viaja en el catalogo para que el POS lo sepa.
ALTER TABLE pp_productos
  ADD COLUMN con_anticipacion TINYINT(1) NOT NULL DEFAULT 0 AFTER es_congelado;
