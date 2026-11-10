-- Turnos de produccion y modo de registro por operario.
-- Cada operario asienta su produccion por horario (ingreso/salida, como hasta
-- ahora) o por turno (Manana, Tarde, Siesta...). Los turnos se configuran en
-- Configuracion; se borran de forma logica (activo = 0) para que los registros
-- viejos sigan mostrando su turno.

CREATE TABLE IF NOT EXISTS produccion_turnos (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  hora_desde TIME DEFAULT NULL, -- opcional: ordena los turnos y se muestra al elegir
  hora_hasta TIME DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO produccion_turnos (nombre) VALUES ('Mañana'), ('Tarde');

ALTER TABLE operarios
  ADD COLUMN modo_registro ENUM('horario', 'turno') NOT NULL DEFAULT 'horario';

ALTER TABLE produccion_registros
  ADD COLUMN turno_id INT DEFAULT NULL AFTER hora_salida,
  ADD KEY idx_turno (turno_id),
  ADD CONSTRAINT fk_produccion_turno FOREIGN KEY (turno_id) REFERENCES produccion_turnos (id) ON DELETE SET NULL;
