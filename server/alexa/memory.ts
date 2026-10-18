import { conversar } from "../conversation";
import { storage } from "../storage";
import type { AlexaMemory } from "./handler";

export const alexaMemory: AlexaMemory = {
  findUser(alexaUserId) {
    const row = storage.getAlexaUsuario(alexaUserId);
    if (!row) return null;
    return { sessionId: row.sessionId, nombre: row.nombre };
  },

  registerUser(alexaUserId, nombre, locale) {
    return storage.registerAlexaUsuario(alexaUserId, nombre, locale);
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
};
