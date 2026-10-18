import { olvidarMensajes, olvidarSesion, olvidarTodo, recordar } from "./cache-peticion";
import { mezclarCampo, perfilVacio, type PerfilCampos } from "./perfil-merge";
import type { Medicamento, MemoriaLargoPlazo, Mensaje, Perfil, Usuario } from "./storage";

type FetchLike = typeof fetch;

interface Pedido {
  data: any;
  count: number | null;
  status: number;
}

function minutoLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

function eq(columna: string, valor: string | number): string {
  return `${columna}=eq.${encodeURIComponent(String(valor))}`;
}

export function crearClienteRest(url: string, key: string, fetchImpl: FetchLike = fetch) {
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  return async function pedir(path: string, init: RequestInit = {}): Promise<Pedido> {
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("Authorization", `Bearer ${key}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await fetchImpl(`${base}/${path}`, { ...init, headers });
    const rango = res.headers.get("content-range");
    const count = rango && rango.includes("/") ? Number(rango.split("/")[1]) : null;
    if (res.status === 204) return { data: null, count: Number.isFinite(count) ? count : null, status: 204 };
    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 180) };
      }
    }
    if (!res.ok) {
      const msg = typeof data?.message === "string" ? data.message : res.statusText;
      throw new Error(`supabase ${res.status}: ${String(msg).slice(0, 180)}`);
    }
    return { data, count: Number.isFinite(count as number) ? count : null, status: res.status };
  };
}

function aUsuario(row: any): Usuario {
  return { id: Number(row.id), sessionId: row.session_id, nombre: row.nombre || "", creadoEn: row.creado_en || "" };
}
function aMed(row: any): Medicamento {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    nombre: row.nombre,
    horario: row.horario,
    activo: row.activo === true || row.activo === 1,
  };
}
function aMensaje(row: any): Mensaje {
  return {
    id: Number(row.id),
    sessionId: row.session_id,
    rol: row.rol,
    contenido: row.contenido,
    orden: Number(row.orden),
    creadoEn: row.creado_en || "",
  };
}
function aPerfil(row: any): Perfil {
  return {
    sessionId: row.session_id,
    apodo: row.apodo || "",
    temas: row.temas || "",
    evitar: row.evitar || "",
    familia: row.familia || "",
    notas: row.notas || "",
  };
}

export function crearAlmacenSupabase(env: NodeJS.ProcessEnv, fetchImpl: FetchLike = fetch) {
  const url = (env.SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_SERVICE_KEY || "").trim();
  const pedir = crearClienteRest(url, key, fetchImpl);

  async function uno(path: string): Promise<any | undefined> {
    const { data } = await pedir(`${path}${path.includes("?") ? "&" : "?"}limit=1`);
    return Array.isArray(data) ? data[0] : data || undefined;
  }

  async function lista(path: string): Promise<any[]> {
    const { data } = await pedir(path);
    return Array.isArray(data) ? data : [];
  }

  async function contar(path: string): Promise<number> {
    const { count } = await pedir(path, { headers: { Prefer: "count=exact", Range: "0-0" } });
    return count ?? 0;
  }

  const almacen = {
    async getUsuario(sessionId: string): Promise<Usuario | undefined> {
      return recordar(`usuario:${sessionId}`, async () => {
        const row = await uno(`usuarios?${eq("session_id", sessionId)}&select=id,session_id,nombre,creado_en`);
        return row ? aUsuario(row) : undefined;
      });
    },

    async createUsuario(sessionId: string, nombre: string): Promise<Usuario> {
      const { data } = await pedir("usuarios", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ session_id: sessionId, nombre }),
      });
      olvidarSesion(sessionId);
      const row = Array.isArray(data) ? data[0] : data;
      return aUsuario(row);
    },

    async getAllUsuarios(): Promise<Usuario[]> {
      const rows = await lista("usuarios?select=id,session_id,nombre,creado_en&order=creado_en.desc");
      return rows.map(aUsuario);
    },

    async deleteUsuario(sessionId: string): Promise<void> {
      await pedir(`usuarios?${eq("session_id", sessionId)}`, { method: "DELETE" });
      olvidarSesion(sessionId);
    },

    async getMedicamentos(sessionId: string): Promise<Medicamento[]> {
      return recordar(`meds:${sessionId}`, async () => {
        const rows = await lista(`medicamentos?${eq("session_id", sessionId)}&activo=eq.true&select=id,session_id,nombre,horario,activo`);
        return rows.map(aMed);
      });
    },

    async addMedicamento(sessionId: string, nombre: string, horario: string): Promise<Medicamento> {
      const { data } = await pedir("medicamentos", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ session_id: sessionId, nombre, horario, activo: true }),
      });
      olvidarSesion(sessionId);
      return aMed(Array.isArray(data) ? data[0] : data);
    },

    async upsertMedicamento(sessionId: string, nombre: string, horario: string): Promise<{ created: boolean; medicamento: Medicamento }> {
      const rows = await lista(
        `medicamentos?${eq("session_id", sessionId)}&activo=eq.true&nombre=ilike.${encodeURIComponent(nombre)}&select=id,session_id,nombre,horario,activo&limit=1`,
      );
      if (rows[0]) {
        await pedir(`medicamentos?${eq("id", rows[0].id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ horario }),
        });
        olvidarSesion(sessionId);
        return { created: false, medicamento: aMed({ ...rows[0], horario }) };
      }
      return { created: true, medicamento: await almacen.addMedicamento(sessionId, nombre, horario) };
    },

    async deleteMedicamento(id: number): Promise<void> {
      await pedir(`medicamentos?${eq("id", id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ activo: false }),
      });
      olvidarTodo();
    },

    async getMensajes(sessionId: string, limit = 200): Promise<Mensaje[]> {
      return recordar(`mensajes:${sessionId}:${limit}`, async () => {
        const rows = await lista(
          `mensajes?${eq("session_id", sessionId)}&select=id,session_id,rol,contenido,orden,creado_en&order=orden.asc&limit=${limit}`,
        );
        return rows.map(aMensaje);
      });
    },

    async getMensajesCount(sessionId: string): Promise<number> {
      return recordar(`mensajesCount:${sessionId}`, () => contar(`mensajes?${eq("session_id", sessionId)}&select=id`));
    },

    async addMensaje(sessionId: string, rol: string, contenido: string, orden: number): Promise<Mensaje> {
      const { data } = await pedir("mensajes", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ session_id: sessionId, rol, contenido, orden }),
      });
      olvidarMensajes(sessionId);
      return aMensaje(Array.isArray(data) ? data[0] : data);
    },

    async clearMensajes(sessionId: string): Promise<void> {
      await pedir(`mensajes?${eq("session_id", sessionId)}`, { method: "DELETE" });
      olvidarMensajes(sessionId);
    },

    async getPerfil(sessionId: string): Promise<Perfil> {
      return recordar(`perfil:${sessionId}`, async () => {
        const row = await uno(`perfiles?${eq("session_id", sessionId)}&select=session_id,apodo,temas,evitar,familia,notas`);
        return row ? aPerfil(row) : perfilVacio(sessionId);
      });
    },

    async savePerfil(
      sessionId: string,
      campos: Partial<Omit<PerfilCampos, "sessionId">>,
      modo: "replace" | "append" = "replace",
    ): Promise<Perfil> {
      const actual = await almacen.getPerfil(sessionId);
      const next = {
        apodo: mezclarCampo("apodo", actual.apodo, campos.apodo, modo),
        temas: mezclarCampo("temas", actual.temas, campos.temas, modo),
        evitar: mezclarCampo("evitar", actual.evitar, campos.evitar, modo),
        familia: mezclarCampo("familia", actual.familia, campos.familia, modo),
        notas: mezclarCampo("notas", actual.notas, campos.notas, modo),
      };
      await pedir("perfiles?on_conflict=session_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: sessionId, ...next }),
      });
      olvidarSesion(sessionId);
      return { sessionId, ...next };
    },

    async getMemoria(sessionId: string): Promise<MemoriaLargoPlazo | undefined> {
      return recordar(`memoria:${sessionId}`, async () => {
        const row = await uno(`memoria_largo_plazo?${eq("session_id", sessionId)}&select=session_id,resumen,hasta_orden`);
        if (!row) return undefined;
        return { sessionId: row.session_id, resumen: row.resumen || "", hastaOrden: Number(row.hasta_orden) || 0 };
      });
    },

    async saveMemoria(sessionId: string, resumen: string, hastaOrden: number): Promise<void> {
      await pedir("memoria_largo_plazo?on_conflict=session_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: sessionId, resumen, hasta_orden: hastaOrden }),
      });
      olvidarSesion(sessionId);
    },

    async saveFcmToken(sessionId: string, token: string): Promise<void> {
      await pedir("fcm_tokens?on_conflict=token", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: sessionId, token }),
      });
      olvidarSesion(sessionId);
    },

    async deleteFcmToken(token: string): Promise<void> {
      await pedir(`fcm_tokens?${eq("token", token)}`, { method: "DELETE" });
      olvidarTodo();
    },

    async getFcmTokensBySession(sessionId: string): Promise<string[]> {
      return recordar(`fcm:${sessionId}`, async () => {
        const rows = await lista(`fcm_tokens?${eq("session_id", sessionId)}&select=token`);
        return rows.map((r) => r.token);
      });
    },

    async savePhone(sessionId: string, telefono: string): Promise<void> {
      await pedir(`usuarios?${eq("session_id", sessionId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ telefono }),
      });
      olvidarSesion(sessionId);
    },

    async getPhone(sessionId: string): Promise<string | null> {
      return recordar(`phone:${sessionId}`, async () => {
        const row = await uno(`usuarios?${eq("session_id", sessionId)}&select=telefono`);
        return row?.telefono || null;
      });
    },

    async arbol() {
      return recordar("cron:arbol", async () => {
        const [meds, usuarios, fcm, push] = await Promise.all([
          lista("medicamentos?activo=eq.true&select=id,session_id,nombre,horario"),
          lista("usuarios?select=session_id,nombre,telefono"),
          lista("fcm_tokens?select=session_id,token"),
          lista("push_suscripciones?select=session_id,endpoint,p256dh,auth"),
        ]);
        const porUsuario = new Map(usuarios.map((u) => [u.session_id, u]));
        return { meds, porUsuario, fcm, push };
      });
    },

    async getMedicamentosConTelefono() {
      const { meds, porUsuario } = await almacen.arbol();
      const salida = [];
      for (const m of meds) {
        const u = porUsuario.get(m.session_id);
        if (!u?.telefono) continue;
        salida.push({
          sessionId: m.session_id,
          medId: Number(m.id),
          nombre: m.nombre,
          horario: m.horario,
          usuarioNombre: u.nombre,
          telefono: u.telefono,
        });
      }
      return salida;
    },

    async getMedicamentosConFCM() {
      const { meds, porUsuario, fcm } = await almacen.arbol();
      const salida = [];
      for (const token of fcm) {
        const u = porUsuario.get(token.session_id);
        if (!u) continue;
        for (const m of meds) {
          if (m.session_id !== token.session_id) continue;
          salida.push({
            sessionId: m.session_id,
            medId: Number(m.id),
            nombre: m.nombre,
            horario: m.horario,
            usuarioNombre: u.nombre,
            token: token.token,
          });
        }
      }
      return salida;
    },

    async savePushSuscripcion(sessionId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
      await pedir("push_suscripciones?on_conflict=endpoint", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: sessionId, endpoint, p256dh, auth }),
      });
      olvidarSesion(sessionId);
    },

    async deletePushSuscripcion(endpoint: string): Promise<void> {
      await pedir(`push_suscripciones?${eq("endpoint", endpoint)}`, { method: "DELETE" });
      olvidarTodo();
    },

    async getPushSuscripcionesBySession(sessionId: string) {
      return recordar(`push:${sessionId}`, async () => {
        const rows = await lista(`push_suscripciones?${eq("session_id", sessionId)}&select=endpoint,p256dh,auth`);
        return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
      });
    },

    async getMedicamentosParaRecordatorio() {
      const { meds, porUsuario, push } = await almacen.arbol();
      const salida = [];
      for (const sub of push) {
        const u = porUsuario.get(sub.session_id);
        if (!u) continue;
        for (const m of meds) {
          if (m.session_id !== sub.session_id) continue;
          salida.push({
            sessionId: m.session_id,
            medId: Number(m.id),
            nombre: m.nombre,
            horario: m.horario,
            usuarioNombre: u.nombre,
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          });
        }
      }
      return salida;
    },

    async yaSeEnvioRecordatorio(sessionId: string, medId: number, fechaHora: string): Promise<boolean> {
      const row = await uno(
        `recordatorios_enviados?${eq("session_id", sessionId)}&${eq("med_id", medId)}&${eq("fecha_hora", fechaHora)}&select=id`,
      );
      return !!row;
    },

    async registrarRecordatorioEnviado(sessionId: string, medId: number): Promise<void> {
      await pedir("recordatorios_enviados", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ session_id: sessionId, med_id: medId, fecha_hora: minutoLocal() }),
      });
    },

    async getAlexaUsuario(alexaUserId: string) {
      return recordar(`alexa:${alexaUserId}`, async () => {
        const row = await uno(
          `alexa_usuarios?${eq("alexa_user_id", alexaUserId)}&select=alexa_user_id,session_id,locale,usuarios!alexa_usuarios_session_id_fkey(nombre)`,
        );
        if (!row) return undefined;
        const anidado = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
        return {
          alexaUserId: row.alexa_user_id,
          sessionId: row.session_id,
          nombre: anidado?.nombre || "",
          locale: row.locale ?? null,
        };
      });
    },

    async registerAlexaUsuario(alexaUserId: string, nombre: string, locale: string) {
      const ya = await almacen.getAlexaUsuario(alexaUserId);
      if (ya) return { sessionId: ya.sessionId, nombre: ya.nombre };
      const sessionId = `alexa:${alexaUserId}`;
      await pedir("usuarios?on_conflict=session_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: sessionId, nombre }),
      });
      try {
        await pedir("alexa_usuarios", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ alexa_user_id: alexaUserId, session_id: sessionId, locale: locale || null }),
        });
      } catch (err) {
        const otra = await uno(
          `alexa_usuarios?${eq("alexa_user_id", alexaUserId)}&select=session_id,usuarios!alexa_usuarios_session_id_fkey(nombre)`,
        );
        if (otra) {
          const anidado = Array.isArray(otra.usuarios) ? otra.usuarios[0] : otra.usuarios;
          return { sessionId: otra.session_id, nombre: anidado?.nombre || nombre };
        }
        throw err;
      }
      olvidarSesion(sessionId);
      olvidarSesion(alexaUserId);
      return { sessionId, nombre };
    },

    async setNombreUsuario(sessionId: string, nombre: string): Promise<void> {
      await pedir(`usuarios?${eq("session_id", sessionId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ nombre }),
      });
      olvidarSesion(sessionId);
    },

    async touchAlexaUsuario(alexaUserId: string, locale?: string): Promise<void> {
      const cuerpo: Record<string, string> = { ultimo_acceso: new Date().toISOString() };
      if (locale) cuerpo.locale = locale;
      await pedir(`alexa_usuarios?${eq("alexa_user_id", alexaUserId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(cuerpo),
      });
    },

    async getStats() {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const [totalUsuarios, totalMensajes, totalMeds, nuevosHoy] = await Promise.all([
        contar("usuarios?select=id"),
        contar("mensajes?select=id"),
        contar("medicamentos?activo=eq.true&select=id"),
        contar(`usuarios?select=id&creado_en=gte.${encodeURIComponent(inicio.toISOString())}`),
      ]);
      return { totalUsuarios, totalMensajes, totalMeds, nuevosHoy };
    },
  };

  return almacen;
}
