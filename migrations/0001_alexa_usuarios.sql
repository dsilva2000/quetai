-- Memoria de Alexa en la misma base que el resto de Quetai.
--
-- El servidor en producción NO usa Supabase ni Postgres.
-- La app guarda usuarios, mensajes y medicamentos en SQLite
-- (archivo data/quetai.db, o DATA_DIR/quetai.db).
-- server/storage.ts crea esta tabla al arrancar con
-- CREATE TABLE IF NOT EXISTS, así que no hay que ejecutar
-- este archivo a mano. Queda como registro de la migración.
--
-- alexa_user_id  → userId que envía Amazon (amzn1.ask.account....)
-- session_id     → misma clave que usuarios/mensajes/medicamentos
--                  (formato alexa:<userId>)

CREATE TABLE IF NOT EXISTS alexa_usuarios (
  alexa_user_id  TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL UNIQUE,
  locale         TEXT,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
);
