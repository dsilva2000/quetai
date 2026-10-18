import { conversar } from "../conversation";
import { obtenerTitulares, type TemaNoticia } from "../noticias";
import { storage } from "../storage";
import type { AlexaMemory, TemaVoz } from "./handler";

export const alexaMemory: AlexaMemory = {
  async findUser(alexaUserId) {
    const sessionId = `alexa:${alexaUserId}`;
    const [row, perfil] = await Promise.all([
      storage.getAlexaUsuario(alexaUserId),
      storage.getPerfil(sessionId),
    ]);
    if (!row) return null;
    const nombre = row.nombre || "";
    return {
      sessionId: row.sessionId,
      nombre,
      apodo: perfil.apodo || undefined,
      nombrePendiente: !nombre.trim(),
    };
  },

  registerUser(alexaUserId, nombre, locale) {
    return storage.registerAlexaUsuario(alexaUserId, nombre, locale);
  },

  async asegurarUsuario(alexaUserId, locale) {
    const ya = await this.findUser(alexaUserId);
    if (ya) return ya;
    const creado = await storage.registerAlexaUsuario(alexaUserId, "", locale);
    return { sessionId: creado.sessionId, nombre: "", nombrePendiente: true };
  },

  async setNombre(sessionId, nombre) {
    await storage.setNombreUsuario(sessionId, nombre);
  },

  touch(alexaUserId, locale) {
    return storage.touchAlexaUsuario(alexaUserId, locale);
  },

  async listMedicamentos(sessionId) {
    const meds = await storage.getMedicamentos(sessionId);
    return meds.map((m) => ({ nombre: m.nombre, horario: m.horario }));
  },

  async saveMedicamento(sessionId, nombre, horario) {
    const res = await storage.upsertMedicamento(sessionId, nombre, horario);
    return { created: res.created };
  },

  async anotarIntercambio(sessionId, usuario, asistente) {
    const historial = await storage.getMensajes(sessionId);
    const orden = historial.length;
    await storage.addMensaje(sessionId, "user", usuario, orden);
    await storage.addMensaje(sessionId, "assistant", asistente, orden + 1);
  },

  clearConversacion(sessionId) {
    return storage.clearMensajes(sessionId);
  },

  conversar(sessionId, mensaje) {
    return conversar(sessionId, mensaje, "alexa");
  },

  async setApodo(sessionId, apodo) {
    await storage.savePerfil(sessionId, { apodo }, "replace");
  },

  async agregarTema(sessionId, tema) {
    await storage.savePerfil(sessionId, { temas: tema }, "append");
  },

  async agregarEvitar(sessionId, tema) {
    await storage.savePerfil(sessionId, { evitar: tema }, "append");
  },

  async agregarFamilia(sessionId, texto) {
    await storage.savePerfil(sessionId, { familia: texto }, "append");
  },

  async titulares(tema: TemaVoz) {
    const temas: TemaNoticia[] = tema === "todos" ? ["actualidad", "farandula", "politica"] : [tema];
    return obtenerTitulares(temas, { timeoutMs: 3500 });
  },
};
