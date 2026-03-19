import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Directorio de datos — en Railway se puede montar un volumen, o usar /tmp como fallback
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "quetai.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema SQL ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL UNIQUE,
    nombre      TEXT    NOT NULL,
    creado_en   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medicamentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    nombre      TEXT    NOT NULL,
    horario     TEXT    NOT NULL,
    activo      INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    rol         TEXT    NOT NULL,
    contenido   TEXT    NOT NULL,
    orden       INTEGER NOT NULL,
    creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
  );
`);

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Usuario {
  id: number;
  sessionId: string;
  nombre: string;
  creadoEn: string;
}

export interface Medicamento {
  id: number;
  sessionId: string;
  nombre: string;
  horario: string;
  activo: boolean;
}

export interface Mensaje {
  id: number;
  sessionId: string;
  rol: string;
  contenido: string;
  orden: number;
  creadoEn: string;
}

// ─── Storage API ───────────────────────────────────────────────────────────────

function rowToUsuario(row: any): Usuario {
  return { id: row.id, sessionId: row.session_id, nombre: row.nombre, creadoEn: row.creado_en };
}
function rowToMed(row: any): Medicamento {
  return { id: row.id, sessionId: row.session_id, nombre: row.nombre, horario: row.horario, activo: row.activo === 1 };
}
function rowToMensaje(row: any): Mensaje {
  return { id: row.id, sessionId: row.session_id, rol: row.rol, contenido: row.contenido, orden: row.orden, creadoEn: row.creado_en };
}

export const storage = {
  // ── Usuarios ────────────────────────────────────────────────────
  getUsuario(sessionId: string): Usuario | undefined {
    const row = db.prepare("SELECT * FROM usuarios WHERE session_id = ?").get(sessionId) as any;
    return row ? rowToUsuario(row) : undefined;
  },

  createUsuario(sessionId: string, nombre: string): Usuario {
    const info = db.prepare("INSERT INTO usuarios (session_id, nombre) VALUES (?, ?)").run(sessionId, nombre);
    return rowToUsuario(db.prepare("SELECT * FROM usuarios WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  getAllUsuarios(): Usuario[] {
    return (db.prepare("SELECT * FROM usuarios ORDER BY creado_en DESC").all() as any[]).map(rowToUsuario);
  },

  deleteUsuario(sessionId: string): void {
    db.prepare("DELETE FROM mensajes WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM medicamentos WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM usuarios WHERE session_id = ?").run(sessionId);
  },

  // ── Medicamentos ────────────────────────────────────────────────
  getMedicamentos(sessionId: string): Medicamento[] {
    return (db.prepare("SELECT * FROM medicamentos WHERE session_id = ? AND activo = 1").all(sessionId) as any[]).map(rowToMed);
  },

  addMedicamento(sessionId: string, nombre: string, horario: string): Medicamento {
    const info = db.prepare("INSERT INTO medicamentos (session_id, nombre, horario) VALUES (?, ?, ?)").run(sessionId, nombre, horario);
    return rowToMed(db.prepare("SELECT * FROM medicamentos WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  deleteMedicamento(id: number): void {
    db.prepare("UPDATE medicamentos SET activo = 0 WHERE id = ?").run(id);
  },

  // ── Mensajes ────────────────────────────────────────────────────
  getMensajes(sessionId: string, limit = 200): Mensaje[] {
    return (db.prepare("SELECT * FROM mensajes WHERE session_id = ? ORDER BY orden ASC LIMIT ?").all(sessionId, limit) as any[]).map(rowToMensaje);
  },

  getMensajesCount(sessionId: string): number {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM mensajes WHERE session_id = ?").get(sessionId) as any;
    return row?.cnt ?? 0;
  },

  addMensaje(sessionId: string, rol: string, contenido: string, orden: number): Mensaje {
    const info = db.prepare("INSERT INTO mensajes (session_id, rol, contenido, orden) VALUES (?, ?, ?, ?)").run(sessionId, rol, contenido, orden);
    return rowToMensaje(db.prepare("SELECT * FROM mensajes WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  clearMensajes(sessionId: string): void {
    db.prepare("DELETE FROM mensajes WHERE session_id = ?").run(sessionId);
  },

  // ── Admin stats ─────────────────────────────────────────────────
  getStats() {
    const totalUsuarios = (db.prepare("SELECT COUNT(*) as cnt FROM usuarios").get() as any).cnt;
    const totalMensajes = (db.prepare("SELECT COUNT(*) as cnt FROM mensajes").get() as any).cnt;
    const totalMeds = (db.prepare("SELECT COUNT(*) as cnt FROM medicamentos WHERE activo = 1").get() as any).cnt;
    const hoy = (db.prepare("SELECT COUNT(*) as cnt FROM usuarios WHERE date(creado_en) = date('now')").get() as any).cnt;
    return { totalUsuarios, totalMensajes, totalMeds, nuevosHoy: hoy };
  },
};
