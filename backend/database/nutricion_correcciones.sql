-- ============================================================================
-- CORRECCIONES A MANO DE LA INFO NUTRICIONAL
--
-- Cada vez que alguien cambia un valor de un ingrediente que ya tenia dato
-- (de la IA o cargado antes), queda asentado: que campo, cuanto valia, cuanto
-- quedo y cuando. Se muestra en el ingrediente ("Modificado") y la IA lo lee
-- en cada analisis para aprender de esas correcciones.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nutri_correcciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ingrediente_id INT NOT NULL,
  campo VARCHAR(30) NOT NULL,                  -- gramos_por_unidad | energia_kcal | proteinas_g | ...
  valor_anterior DECIMAL(12,4) NOT NULL,
  valor_nuevo DECIMAL(12,4) NOT NULL,
  origen_anterior ENUM('ia', 'manual') NOT NULL, -- de donde venia el valor corregido
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nutri_correcciones_ingrediente (ingrediente_id),
  CONSTRAINT fk_nutri_correcciones_ingrediente FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id) ON DELETE CASCADE
);
