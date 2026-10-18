-- Perfil y memoria de largo plazo por sesión.
-- El servidor también crea estas tablas al arrancar (server/storage.ts).
-- No incluye datos de ninguna persona.

CREATE TABLE IF NOT EXISTS perfiles (
  session_id     TEXT PRIMARY KEY,
  apodo          TEXT NOT NULL DEFAULT '',
  temas          TEXT NOT NULL DEFAULT '',
  evitar         TEXT NOT NULL DEFAULT '',
  familia        TEXT NOT NULL DEFAULT '',
  notas          TEXT NOT NULL DEFAULT '',
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
);

CREATE TABLE IF NOT EXISTS memoria_largo_plazo (
  session_id     TEXT PRIMARY KEY,
  resumen        TEXT NOT NULL DEFAULT '',
  hasta_orden    INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
);
