import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { olvidarMensajes, olvidarSesion, olvidarTodo, recordar } from "./cache-peticion";
import { directorioPersistente, leerMontajes, resolverDirectorioDatos } from "./datos";
import { mezclarCampo, perfilVacio } from "./perfil-merge";
import { crearAlmacenSupabase } from "./supabase-store";
import { storeActivo } from "./store-kind";

// En Render el disco persistente va en DATA_DIR (/app/data). Sin esa variable
// el archivo cae en el árbol del repo, que se borra en cada deploy.
const MODO = storeActivo(process.env);
const urlSupabase = (process.env.SUPABASE_URL || "").trim();
const keySupabase = (process.env.SUPABASE_SERVICE_KEY || "").trim();
console.log(JSON.stringify({
  evento: "db.store",
  store: MODO,
  aviso: (urlSupabase && !keySupabase) || (!urlSupabase && keySupabase)
    ? "falta SUPABASE_URL o SUPABASE_SERVICE_KEY; se usa sqlite"
    : undefined,
}));

const DATA_DIR = resolverDirectorioDatos(process.env, process.cwd());
let db: Database.Database | null = null;
if (MODO === "sqlite") {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = path.join(DATA_DIR, "quetai.db");
  const montado = directorioPersistente(DATA_DIR, leerMontajes());
  console.log(JSON.stringify({
    evento: "db.ruta",
    dir: DATA_DIR,
    archivo: "quetai.db",
    montado,
    aviso: montado ? undefined : "directorio efimero: un deploy o el spin-down del plan free borra los usuarios",
  }));
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}

if (db) {
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
}

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

const sqliteStorage = {
  async getUsuario(sessionId: string): Promise<Usuario | undefined> {
    return recordar(`usuario:${sessionId}`, async () => {
      const row = db!.prepare("SELECT * FROM usuarios WHERE session_id = ?").get(sessionId) as any;
      return row ? rowToUsuario(row) : undefined;
    });
  },

  async createUsuario(sessionId: string, nombre: string): Promise<Usuario> {
    const info = db!.prepare("INSERT INTO usuarios (session_id, nombre) VALUES (?, ?)").run(sessionId, nombre);
    olvidarSesion(sessionId);
    return rowToUsuario(db!.prepare("SELECT * FROM usuarios WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  async getAllUsuarios(): Promise<Usuario[]> {
    return (db!.prepare("SELECT * FROM usuarios ORDER BY creado_en DESC").all() as any[]).map(rowToUsuario);
  },

  async deleteUsuario(sessionId: string): Promise<void> {
    const sqlite = db!;
    sqlite.prepare("DELETE FROM alexa_usuarios WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM perfiles WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM memoria_largo_plazo WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM mensajes WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM medicamentos WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM fcm_tokens WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM push_suscripciones WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM recordatorios_enviados WHERE session_id = ?").run(sessionId);
    sqlite.prepare("DELETE FROM usuarios WHERE session_id = ?").run(sessionId);
    olvidarSesion(sessionId);
  },

  async getMedicamentos(sessionId: string): Promise<Medicamento[]> {
    return recordar(`meds:${sessionId}`, async () => {
      return (db!.prepare("SELECT * FROM medicamentos WHERE session_id = ? AND activo = 1").all(sessionId) as any[]).map(rowToMed);
    });
  },

  async addMedicamento(sessionId: string, nombre: string, horario: string): Promise<Medicamento> {
    const info = db!.prepare("INSERT INTO medicamentos (session_id, nombre, horario) VALUES (?, ?, ?)").run(sessionId, nombre, horario);
    olvidarSesion(sessionId);
    return rowToMed(db!.prepare("SELECT * FROM medicamentos WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  async upsertMedicamento(sessionId: string, nombre: string, horario: string): Promise<{ created: boolean; medicamento: Medicamento }> {
    const existing = db!.prepare(
      "SELECT * FROM medicamentos WHERE session_id = ? AND lower(nombre) = lower(?) AND activo = 1"
    ).get(sessionId, nombre) as any;
    if (existing) {
      db!.prepare("UPDATE medicamentos SET horario = ? WHERE id = ?").run(horario, existing.id);
      olvidarSesion(sessionId);
      return { created: false, medicamento: rowToMed({ ...existing, horario }) };
    }
    return { created: true, medicamento: await this.addMedicamento(sessionId, nombre, horario) };
  },

  async deleteMedicamento(id: number): Promise<void> {
    db!.prepare("UPDATE medicamentos SET activo = 0 WHERE id = ?").run(id);
    olvidarTodo();
  },

  async getMensajes(sessionId: string, limit = 200): Promise<Mensaje[]> {
    return recordar(`mensajes:${sessionId}:${limit}`, async () => {
      return (db!.prepare("SELECT * FROM mensajes WHERE session_id = ? ORDER BY orden ASC LIMIT ?").all(sessionId, limit) as any[]).map(rowToMensaje);
    });
  },

  async getMensajesCount(sessionId: string): Promise<number> {
    return recordar(`mensajesCount:${sessionId}`, async () => {
      const row = db!.prepare("SELECT COUNT(*) as cnt FROM mensajes WHERE session_id = ?").get(sessionId) as any;
      return row?.cnt ?? 0;
    });
  },

  async addMensaje(sessionId: string, rol: string, contenido: string, orden: number): Promise<Mensaje> {
    const info = db!.prepare("INSERT INTO mensajes (session_id, rol, contenido, orden) VALUES (?, ?, ?, ?)").run(sessionId, rol, contenido, orden);
    olvidarMensajes(sessionId);
    return rowToMensaje(db!.prepare("SELECT * FROM mensajes WHERE id = ?").get(info.lastInsertRowid) as any);
  },

  async clearMensajes(sessionId: string): Promise<void> {
    db!.prepare("DELETE FROM mensajes WHERE session_id = ?").run(sessionId);
    olvidarMensajes(sessionId);
  },

  async getPerfil(sessionId: string): Promise<Perfil> {
    return recordar(`perfil:${sessionId}`, async () => {
      const row = db!.prepare("SELECT * FROM perfiles WHERE session_id = ?").get(sessionId) as any;
      if (!row) return perfilVacio(sessionId);
      return rowToPerfil(row);
    });
  },

  async savePerfil(
    sessionId: string,
    campos: Partial<Omit<Perfil, "sessionId">>,
    modo: "replace" | "append" = "replace",
  ): Promise<Perfil> {
    const actual = await this.getPerfil(sessionId);
    const next = {
      apodo: mezclarCampo("apodo", actual.apodo, campos.apodo, modo),
      temas: mezclarCampo("temas", actual.temas, campos.temas, modo),
      evitar: mezclarCampo("evitar", actual.evitar, campos.evitar, modo),
      familia: mezclarCampo("familia", actual.familia, campos.familia, modo),
      notas: mezclarCampo("notas", actual.notas, campos.notas, modo),
    };
    db!.prepare(`
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
    olvidarSesion(sessionId);
    return { sessionId, ...next };
  },

  async getMemoria(sessionId: string): Promise<MemoriaLargoPlazo | undefined> {
    return recordar(`memoria:${sessionId}`, async () => {
      const row = db!.prepare(
        "SELECT session_id, resumen, hasta_orden FROM memoria_largo_plazo WHERE session_id = ?"
      ).get(sessionId) as any;
      if (!row) return undefined;
      return { sessionId: row.session_id, resumen: row.resumen || "", hastaOrden: row.hasta_orden || 0 };
    });
  },

  async saveMemoria(sessionId: string, resumen: string, hastaOrden: number): Promise<void> {
    db!.prepare(`
      INSERT INTO memoria_largo_plazo (session_id, resumen, hasta_orden, actualizado_en)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        resumen = excluded.resumen,
        hasta_orden = excluded.hasta_orden,
        actualizado_en = datetime('now')
    `).run(sessionId, resumen, hastaOrden);
    olvidarSesion(sessionId);
  },

  async saveFcmToken(sessionId: string, token: string): Promise<void> {
    db!.prepare(`
      INSERT INTO fcm_tokens (session_id, token)
      VALUES (?, ?)
      ON CONFLICT(token) DO UPDATE SET session_id=excluded.session_id
    `).run(sessionId, token);
    olvidarSesion(sessionId);
  },

  async deleteFcmToken(token: string): Promise<void> {
    db!.prepare("DELETE FROM fcm_tokens WHERE token = ?").run(token);
    olvidarTodo();
  },

  async getFcmTokensBySession(sessionId: string): Promise<string[]> {
    return recordar(`fcm:${sessionId}`, async () => {
      return (db!.prepare("SELECT token FROM fcm_tokens WHERE session_id = ?").all(sessionId) as any[]).map(r => r.token);
    });
  },

  async savePhone(sessionId: string, telefono: string): Promise<void> {
    db!.prepare("UPDATE usuarios SET telefono = ? WHERE session_id = ?").run(telefono, sessionId);
    olvidarSesion(sessionId);
  },

  async getPhone(sessionId: string): Promise<string | null> {
    return recordar(`phone:${sessionId}`, async () => {
      const row = db!.prepare("SELECT telefono FROM usuarios WHERE session_id = ?").get(sessionId) as any;
      return row?.telefono || null;
    });
  },

  async getMedicamentosConTelefono(): Promise<{ sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; telefono: string }[]> {
    return (db!.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, u.telefono
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      WHERE m.activo = 1 AND u.telefono IS NOT NULL AND u.telefono != ''
    `).all() as any[]);
  },

  async getMedicamentosConFCM(): Promise<{ sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; token: string }[]> {
    return (db!.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, f.token
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      JOIN fcm_tokens f ON f.session_id = m.session_id
      WHERE m.activo = 1
    `).all() as any[]);
  },

  async savePushSuscripcion(sessionId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
    db!.prepare(`
      INSERT INTO push_suscripciones (session_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET session_id=excluded.session_id, p256dh=excluded.p256dh, auth=excluded.auth
    `).run(sessionId, endpoint, p256dh, auth);
    olvidarSesion(sessionId);
  },

  async deletePushSuscripcion(endpoint: string): Promise<void> {
    db!.prepare("DELETE FROM push_suscripciones WHERE endpoint = ?").run(endpoint);
    olvidarTodo();
  },

  async getPushSuscripcionesBySession(sessionId: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
    return recordar(`push:${sessionId}`, async () => {
      return (db!.prepare("SELECT endpoint, p256dh, auth FROM push_suscripciones WHERE session_id = ?").all(sessionId) as any[]);
    });
  },

  async getMedicamentosParaRecordatorio(): Promise<{ sessionId: string; medId: number; nombre: string; horario: string; usuarioNombre: string; endpoint: string; p256dh: string; auth: string }[]> {
    return (db!.prepare(`
      SELECT m.session_id as sessionId, m.id as medId, m.nombre, m.horario,
             u.nombre as usuarioNombre, p.endpoint, p.p256dh, p.auth
      FROM medicamentos m
      JOIN usuarios u ON u.session_id = m.session_id
      JOIN push_suscripciones p ON p.session_id = m.session_id
      WHERE m.activo = 1
    `).all() as any[]);
  },

  async yaSeEnvioRecordatorio(sessionId: string, medId: number, fechaHora: string): Promise<boolean> {
    const row = db!.prepare(`
      SELECT id FROM recordatorios_enviados
      WHERE session_id = ? AND med_id = ? AND strftime('%Y-%m-%d %H:%M', fecha_hora) = ?
    `).get(sessionId, medId, fechaHora) as any;
    return !!row;
  },

  async registrarRecordatorioEnviado(sessionId: string, medId: number): Promise<void> {
    db!.prepare("INSERT INTO recordatorios_enviados (session_id, med_id) VALUES (?, ?)").run(sessionId, medId);
  },

  async getAlexaUsuario(alexaUserId: string): Promise<{ alexaUserId: string; sessionId: string; nombre: string; locale: string | null } | undefined> {
    return recordar(`alexa:${alexaUserId}`, async () => {
      const row = db!.prepare(`
        SELECT a.alexa_user_id as alexaUserId, a.session_id as sessionId, a.locale as locale, u.nombre as nombre
        FROM alexa_usuarios a
        JOIN usuarios u ON u.session_id = a.session_id
        WHERE a.alexa_user_id = ?
      `).get(alexaUserId) as any;
      return row || undefined;
    });
  },

  async registerAlexaUsuario(alexaUserId: string, nombre: string, locale: string): Promise<{ sessionId: string; nombre: string }> {
    const ya = await this.getAlexaUsuario(alexaUserId);
    if (ya) return { sessionId: ya.sessionId, nombre: ya.nombre };

    const sessionId = `alexa:${alexaUserId}`;
    const crear = db!.transaction(() => {
      const existe = db!.prepare("SELECT id FROM usuarios WHERE session_id = ?").get(sessionId);
      if (!existe) {
        db!.prepare("INSERT INTO usuarios (session_id, nombre) VALUES (?, ?)").run(sessionId, nombre);
      }
      db!.prepare(
        "INSERT INTO alexa_usuarios (alexa_user_id, session_id, locale) VALUES (?, ?, ?)"
      ).run(alexaUserId, sessionId, locale || null);
    });
    try {
      crear();
    } catch (err) {
      olvidarSesion(sessionId);
      olvidarSesion(alexaUserId);
      const otraVez = await this.getAlexaUsuario(alexaUserId);
      if (otraVez) return { sessionId: otraVez.sessionId, nombre: otraVez.nombre };
      throw err;
    }
    olvidarSesion(sessionId);
    olvidarSesion(alexaUserId);
    return { sessionId, nombre };
  },

  async setNombreUsuario(sessionId: string, nombre: string): Promise<void> {
    db!.prepare("UPDATE usuarios SET nombre = ? WHERE session_id = ?").run(nombre, sessionId);
    olvidarSesion(sessionId);
  },

  async touchAlexaUsuario(alexaUserId: string, locale?: string): Promise<void> {
    if (locale) {
      db!.prepare(
        "UPDATE alexa_usuarios SET ultimo_acceso = datetime('now'), locale = ? WHERE alexa_user_id = ?"
      ).run(locale, alexaUserId);
    } else {
      db!.prepare(
        "UPDATE alexa_usuarios SET ultimo_acceso = datetime('now') WHERE alexa_user_id = ?"
      ).run(alexaUserId);
    }
    olvidarSesion(alexaUserId);
  },

  async getStats() {
    const totalUsuarios = (db!.prepare("SELECT COUNT(*) as cnt FROM usuarios").get() as any).cnt;
    const totalMensajes = (db!.prepare("SELECT COUNT(*) as cnt FROM mensajes").get() as any).cnt;
    const totalMeds = (db!.prepare("SELECT COUNT(*) as cnt FROM medicamentos WHERE activo = 1").get() as any).cnt;
    const hoy = (db!.prepare("SELECT COUNT(*) as cnt FROM usuarios WHERE date(creado_en) = date('now')").get() as any).cnt;
    return { totalUsuarios, totalMensajes, totalMeds, nuevosHoy: hoy };
  },
};

export const storage = MODO === "supabase" ? crearAlmacenSupabase(process.env) : sqliteStorage;
