-- Precio de venta simulado de un costo manual de promo (opcional, 0 = solo
-- costo, ej. un vaso que no se cobra). Con precio cuenta como un producto mas
-- en el precio de lista y en la promo.
ALTER TABLE oferta_costos_manuales
  ADD COLUMN precio DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER costo;
