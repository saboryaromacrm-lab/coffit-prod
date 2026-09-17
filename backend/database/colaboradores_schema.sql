-- ============================================================================
-- COLABORADORES
-- Cada colaborador tiene un link de acceso propio (access_key, no adivinable)
-- y una lista de secciones habilitadas. Se administra desde Configuracion.
-- No es un login con contraseña: el acceso es por link (revocable borrando o
-- desactivando el colaborador). Ejecutar una vez en phpMyAdmin.
-- ============================================================================

CREATE TABLE IF NOT EXISTS colaboradores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  access_key VARCHAR(64) NOT NULL UNIQUE,
  secciones TEXT NULL,          -- JSON array de keys de seccion habilitadas
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
