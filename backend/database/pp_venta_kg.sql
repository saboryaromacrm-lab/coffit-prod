-- Venta por kg desde Productos: un producto de CoffitCost con peso se vende
-- como producto unico de pedidos personalizados (ver ventaPorKg.js).
ALTER TABLE productos
  ADD COLUMN precio_venta_kg DECIMAL(12,2) NULL AFTER peso_total_g;

-- El producto de pedidos personalizados vinculado y lo que pesa.
ALTER TABLE pp_productos
  ADD COLUMN peso_kg DECIMAL(8,3) NULL AFTER precio_base,
  ADD COLUMN cc_producto_id INT NULL AFTER origen_ref,
  ADD UNIQUE KEY uq_pp_productos_cc (cc_producto_id),
  ADD CONSTRAINT fk_pp_productos_cc FOREIGN KEY (cc_producto_id) REFERENCES productos(id) ON DELETE SET NULL;

-- Porciones por kg con 6 decimales: con 3, una torta de 1,2 kg en 8
-- porciones (6,667 porc/kg) ya corria el costo unos pesos.
ALTER TABLE pp_receta_lineas
  MODIFY cantidad DECIMAL(14,6) NOT NULL DEFAULT 1;
