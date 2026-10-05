-- ============================================================================
-- CHECKLIST DE CONTROL DE LA CARTA
--
-- Una fila por item de la carta que alguien ya controlo (o le anoto algo).
-- Los items sin fila estan pendientes. Se usa para recorrer la carta item por
-- item y verificar que cada producto se hace como corresponde.
--
-- actualizado_por guarda quien marco: el nombre del colaborador (resuelto
-- desde su link) o 'Admin' si fue desde la app.
--
-- Ejecutar una sola vez (con la base seleccionada).
-- ============================================================================

CREATE TABLE carta_checklist (
  carta_item_id INT PRIMARY KEY,
  hecho TINYINT(1) NOT NULL DEFAULT 0,
  observacion TEXT NULL,
  actualizado_por VARCHAR(100) NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_checklist_carta FOREIGN KEY (carta_item_id)
    REFERENCES carta_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
