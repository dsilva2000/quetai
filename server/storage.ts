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

// ── Migración segura: agregar tablas nuevas si no existen ──────────────────
const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((r: any) => r.name);
// Tabla de tokens FCM para notificaciones nativas (APK)
if (!tablas.includes('fcm_tokens')) {
  db.exec(`
    CREATE TABLE fcm_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      token       TEXT    NOT NULL UNIQUE,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log('[db] Tabla fcm_tokens creada');
}

if (!tablas.includes('push_suscripciones')) {
  db.exec(`
    CREATE TABLE push_suscripciones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      endpoint    TEXT    NOT NULL UNIQUE,
      p256dh      TEXT    NOT NULL,
      auth        TEXT    NOT NULL,
      creado_en   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log('[db] Tabla push_suscripciones creada');
}
if (!tablas.includes('recordatorios_enviados')) {
  db.exec(`
    CREATE TABLE recordatorios_enviados (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      med_id      INTEGER NOT NULL,
      fecha_hora  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log('[db] Tabla recordatorios_enviados creada');
}

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

  CREATE TABLE IF NOT EXISTS push_suscripciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    endpoint    TEXT    NOT NULL UNIQUE,
    p256dh      TEXT    NOT NULL,
    auth        TEXT    NOT NULL,
    creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
  );

  CREATE TABLE IF NOT EXISTS recordatorios_enviados (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    med_id      INTEGER NOT NULL,
    fecha_hora  TEXT    NOT NULL DEFAULT (datetime('now'))
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

  // ── FCM tokens (APK) ─────────────────────────────────
  saveFcmToken(sessionId: string, token: string): void {
    db.prepare(`
      INSERT INTO fcm_tokens (session_id, token)
      VALUES (?, ?)
      ON CONFLICT(token) DO UPDATE SET session_id=excluded.session_id
    `).run(sessionId, token);
  },

  deleteFcmToken(token: string): void {
    db.prepare("DELETE FROM fcm_tokens WHERE token = ?").run(token);
  },

  getFcmTokensBySession(sessionId: string): string[] {
    return (db.prepare("SELECT token FROM fcm_tokens WHERE session_id = ?").all(sessionId) as any[]).map(r => r.token);
  },

  // Para el cron: obtener todos los medicamentos con sus FCM tokens
  getMedicamentosConFCM(): { sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; token: string }[] {
    return (db.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, f.token
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      JOIN fcm_tokens f ON f.session_id = m.session_id
      WHERE m.activo = 1
    `).all() as any[]);
  },

  // ── Push suscripciones ──────────────────────────────
  savePushSuscripcion(sessionId: string, endpoint: string, p256dh: string, auth: string): void {
    db.prepare(`
      INSERT INTO push_suscripciones (session_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET session_id=excluded.session_id, p256dh=excluded.p256dh, auth=excluded.auth
    `).run(sessionId, endpoint, p256dh, auth);
  },

  deletePushSuscripcion(endpoint: string): void {
    db.prepare("DELETE FROM push_suscripciones WHERE endpoint = ?").run(endpoint);
  },

  getPushSuscripcionesBySession(sessionId: string): { endpoint: string; p256dh: string; auth: string }[] {
    return (db.prepare("SELECT endpoint, p256dh, auth FROM push_suscripciones WHERE session_id = ?").all(sessionId) as any[]);
  },

  // Para el cron: obtener todos los medicamentos activos con sus suscripciones
  getMedicamentosParaRecordatorio(): { sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; endpoint: string; p256dh: string; auth: string }[] {
    return (db.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, p.endpoint, p.p256dh, p.auth
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      JOIN push_suscripciones p ON p.session_id = m.session_id
      WHERE m.activo = 1
    `).all() as any[]);
  },

  yaSeEnvioRecordatorio(sessionId: string, medId: number, fechaHora: string): boolean {
    const row = db.prepare(`
      SELECT id FROM recordatorios_enviados
      WHERE session_id = ? AND med_id = ? AND strftime('%Y-%m-%d %H:%M', fecha_hora) = ?
    `).get(sessionId, medId, fechaHora) as any;
    return !!row;
  },

  registrarRecordatorioEnviado(sessionId: string, medId: number): void {
    db.prepare("INSERT INTO recordatorios_enviados (session_id, med_id) VALUES (?, ?)").run(sessionId, medId);
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
