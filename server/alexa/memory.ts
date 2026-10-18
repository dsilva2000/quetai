import { conversar } from "../conversation";
import { obtenerTitulares, type TemaNoticia } from "../noticias";
import { storage } from "../storage";
import type { AlexaMemory, TemaVoz } from "./handler";

export const alexaMemory: AlexaMemory = {
  findUser(alexaUserId) {
    const row = storage.getAlexaUsuario(alexaUserId);
    if (!row) return null;
    const perfil = storage.getPerfil(row.sessionId);
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

  asegurarUsuario(alexaUserId, locale) {
    const ya = this.findUser(alexaUserId);
    if (ya) return ya;
    const creado = storage.registerAlexaUsuario(alexaUserId, "", locale);
    return { sessionId: creado.sessionId, nombre: "", nombrePendiente: true };
  },

  setNombre(sessionId, nombre) {
    storage.setNombreUsuario(sessionId, nombre);
  },

  touch(alexaUserId, locale) {
    storage.touchAlexaUsuario(alexaUserId, locale);
  },

  listMedicamentos(sessionId) {
    return storage.getMedicamentos(sessionId).map((m) => ({ nombre: m.nombre, horario: m.horario }));
  },

  saveMedicamento(sessionId, nombre, horario) {
    const res = storage.upsertMedicamento(sessionId, nombre, horario);
    return { created: res.created };
  },

  anotarIntercambio(sessionId, usuario, asistente) {
    const historial = storage.getMensajes(sessionId);
    const orden = historial.length;
    storage.addMensaje(sessionId, "user", usuario, orden);
    storage.addMensaje(sessionId, "assistant", asistente, orden + 1);
  },

  clearConversacion(sessionId) {
    storage.clearMensajes(sessionId);
  },

  conversar(sessionId, mensaje) {
    return conversar(sessionId, mensaje, "alexa");
  },

  setApodo(sessionId, apodo) {
    storage.savePerfil(sessionId, { apodo }, "replace");
  },

  agregarTema(sessionId, tema) {
    storage.savePerfil(sessionId, { temas: tema }, "append");
  },

  agregarEvitar(sessionId, tema) {
    storage.savePerfil(sessionId, { evitar: tema }, "append");
  },

  agregarFamilia(sessionId, texto) {
    storage.savePerfil(sessionId, { familia: texto }, "append");
  },

  async titulares(tema: TemaVoz) {
    const temas: TemaNoticia[] = tema === "todos" ? ["actualidad", "farandula", "politica"] : [tema];
    return obtenerTitulares(temas, { timeoutMs: 3500 });
  },
};
