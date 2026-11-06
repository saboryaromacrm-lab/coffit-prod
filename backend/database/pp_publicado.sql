-- Pedidos personalizados: pp_productos.activo pasa a ser "Publicado" (lo que
-- ve la API del POS). Por defecto un producto nace sin publicar, y los que
-- habia arrancan sin publicar: se publica uno por uno cuando esta listo.
ALTER TABLE pp_productos
  MODIFY activo TINYINT(1) NOT NULL DEFAULT 0;
UPDATE pp_productos SET activo = 0;
