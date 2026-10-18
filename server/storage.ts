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
// Migración: agregar columna telefono si no existe
try {
  db.exec("ALTER TABLE usuarios ADD COLUMN telefono TEXT DEFAULT NULL");
  console.log('[db] Columna telefono agregada a usuarios');
} catch (e) { /* ya existe */ }

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

  CREATE TABLE IF NOT EXISTS alexa_usuarios (
    alexa_user_id  TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL UNIQUE,
    locale         TEXT,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_acceso  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES usuarios(session_id)
  );

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

export interface Perfil {
  sessionId: string;
  apodo: string;
  temas: string;
  evitar: string;
  familia: string;
  notas: string;
}

export interface MemoriaLargoPlazo {
  sessionId: string;
  resumen: string;
  hastaOrden: number;
}

function perfilVacio(sessionId: string): Perfil {
  return { sessionId, apodo: "", temas: "", evitar: "", familia: "", notas: "" };
}

function rowToPerfil(row: any): Perfil {
  return {
    sessionId: row.session_id,
    apodo: row.apodo || "",
    temas: row.temas || "",
    evitar: row.evitar || "",
    familia: row.familia || "",
    notas: row.notas || "",
  };
}

function unirLista(actual: string, extra: string): string {
  const piezas = `${actual},${extra}`.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const pieza of piezas) {
    const clave = pieza.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(pieza);
  }
  return salida.join(", ");
}

function mezclarCampo(
  clave: "apodo" | "temas" | "evitar" | "familia" | "notas",
  actual: string,
  entrante: string | undefined,
  modo: "replace" | "append",
): string {
  if (entrante === undefined) return actual;
  const valor = String(entrante).trim();
  if (modo !== "append" || clave === "apodo") return valor;
  if (!valor) return actual;
  if (clave === "notas") {
    if (!actual) return valor;
    if (actual.toLowerCase().includes(valor.toLowerCase())) return actual;
    return `${actual}. ${valor}`;
  }
  return unirLista(actual, valor);
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
    db.prepare("DELETE FROM alexa_usuarios WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM perfiles WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM memoria_largo_plazo WHERE session_id = ?").run(sessionId);
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

  upsertMedicamento(sessionId: string, nombre: string, horario: string): { created: boolean; medicamento: Medicamento } {
    const existing = db.prepare(
      "SELECT * FROM medicamentos WHERE session_id = ? AND lower(nombre) = lower(?) AND activo = 1"
    ).get(sessionId, nombre) as any;
    if (existing) {
      db.prepare("UPDATE medicamentos SET horario = ? WHERE id = ?").run(horario, existing.id);
      return { created: false, medicamento: rowToMed({ ...existing, horario }) };
    }
    return { created: true, medicamento: this.addMedicamento(sessionId, nombre, horario) };
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

  // ── Perfil por sesión (cuidador o voz). Vacío hasta que alguien lo llene. ──
  getPerfil(sessionId: string): Perfil {
    const row = db.prepare("SELECT * FROM perfiles WHERE session_id = ?").get(sessionId) as any;
    if (!row) return perfilVacio(sessionId);
    return rowToPerfil(row);
  },

  savePerfil(
    sessionId: string,
    campos: Partial<Omit<Perfil, "sessionId">>,
    modo: "replace" | "append" = "replace",
  ): Perfil {
    const actual = this.getPerfil(sessionId);
    const next = {
      apodo: mezclarCampo("apodo", actual.apodo, campos.apodo, modo),
      temas: mezclarCampo("temas", actual.temas, campos.temas, modo),
      evitar: mezclarCampo("evitar", actual.evitar, campos.evitar, modo),
      familia: mezclarCampo("familia", actual.familia, campos.familia, modo),
      notas: mezclarCampo("notas", actual.notas, campos.notas, modo),
    };
    db.prepare(`
      INSERT INTO perfiles (session_id, apodo, temas, evitar, familia, notas, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        apodo = excluded.apodo,
        temas = excluded.temas,
        evitar = excluded.evitar,
        familia = excluded.familia,
        notas = excluded.notas,
        actualizado_en = datetime('now')
    `).run(sessionId, next.apodo, next.temas, next.evitar, next.familia, next.notas);
    return { sessionId, ...next };
  },

  getMemoria(sessionId: string): MemoriaLargoPlazo | undefined {
    const row = db.prepare(
      "SELECT session_id, resumen, hasta_orden FROM memoria_largo_plazo WHERE session_id = ?"
    ).get(sessionId) as any;
    if (!row) return undefined;
    return { sessionId: row.session_id, resumen: row.resumen || "", hastaOrden: row.hasta_orden || 0 };
  },

  saveMemoria(sessionId: string, resumen: string, hastaOrden: number): void {
    db.prepare(`
      INSERT INTO memoria_largo_plazo (session_id, resumen, hasta_orden, actualizado_en)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        resumen = excluded.resumen,
        hasta_orden = excluded.hasta_orden,
        actualizado_en = datetime('now')
    `).run(sessionId, resumen, hastaOrden);
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

  savePhone(sessionId: string, telefono: string): void {
    db.prepare("UPDATE usuarios SET telefono = ? WHERE session_id = ?").run(telefono, sessionId);
  },

  getPhone(sessionId: string): string | null {
    const row = db.prepare("SELECT telefono FROM usuarios WHERE session_id = ?").get(sessionId) as any;
    return row?.telefono || null;
  },

  // Para el cron: medicamentos con teléfono (WhatsApp fallback)
  getMedicamentosConTelefono(): { sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; telefono: string }[] {
    return (db.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, u.telefono
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      WHERE m.activo = 1 AND u.telefono IS NOT NULL AND u.telefono != ''
    `).all() as any[]);
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

  // ── Alexa: un userId de Amazon → la misma sesión Quetai ─────────
  getAlexaUsuario(alexaUserId: string): { alexaUserId: string; sessionId: string; nombre: string; locale: string | null } | undefined {
    const row = db.prepare(`
      SELECT a.alexa_user_id as alexaUserId, a.session_id as sessionId, a.locale as locale, u.nombre as nombre
      FROM alexa_usuarios a
      JOIN usuarios u ON u.session_id = a.session_id
      WHERE a.alexa_user_id = ?
    `).get(alexaUserId) as any;
    return row || undefined;
  },

  registerAlexaUsuario(alexaUserId: string, nombre: string, locale: string): { sessionId: string; nombre: string } {
    const ya = this.getAlexaUsuario(alexaUserId);
    if (ya) return { sessionId: ya.sessionId, nombre: ya.nombre };

    const sessionId = `alexa:${alexaUserId}`;
    const crear = db.transaction(() => {
      const existe = db.prepare("SELECT id FROM usuarios WHERE session_id = ?").get(sessionId);
      if (!existe) {
        db.prepare("INSERT INTO usuarios (session_id, nombre) VALUES (?, ?)").run(sessionId, nombre);
      }
      db.prepare(
        "INSERT INTO alexa_usuarios (alexa_user_id, session_id, locale) VALUES (?, ?, ?)"
      ).run(alexaUserId, sessionId, locale || null);
    });
    try {
      crear();
    } catch (err) {
      const otraVez = this.getAlexaUsuario(alexaUserId);
      if (otraVez) return { sessionId: otraVez.sessionId, nombre: otraVez.nombre };
      throw err;
    }
    return { sessionId, nombre };
  },

  touchAlexaUsuario(alexaUserId: string, locale?: string): void {
    if (locale) {
      db.prepare(
        "UPDATE alexa_usuarios SET ultimo_acceso = datetime('now'), locale = ? WHERE alexa_user_id = ?"
      ).run(locale, alexaUserId);
    } else {
      db.prepare(
        "UPDATE alexa_usuarios SET ultimo_acceso = datetime('now') WHERE alexa_user_id = ?"
      ).run(alexaUserId);
    }
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
