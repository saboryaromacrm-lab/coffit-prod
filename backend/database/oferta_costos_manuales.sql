-- Promos/Boxs: costos cargados a mano dentro de una promo (ej. "Vaso" $100)
-- sin darlos de alta como ingrediente ni producto. Suman costo, no precio.
CREATE TABLE IF NOT EXISTS oferta_costos_manuales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  oferta_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  costo DECIMAL(12,2) NOT NULL DEFAULT 0,   -- costo por unidad
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1,
  KEY idx_oferta_costos_manuales_oferta (oferta_id),
  CONSTRAINT fk_oferta_costos_manuales_oferta FOREIGN KEY (oferta_id) REFERENCES ofertas(id) ON DELETE CASCADE
);
