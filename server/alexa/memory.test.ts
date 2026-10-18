import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "quetai-alexa-"));
process.env.DATA_DIR = dir;

test("vincula un usuario de Alexa y recuerda medicamentos en su sesión", async () => {
  const { storage } = await import("../storage.ts");
  const creado = storage.registerAlexaUsuario("amzn1.ask.account.ABC", "María López", "es-US");
  assert.equal(creado.nombre, "María López");
  assert.equal(creado.sessionId, "alexa:amzn1.ask.account.ABC");

  const otraVez = storage.registerAlexaUsuario("amzn1.ask.account.ABC", "Otra", "es-MX");
  assert.equal(otraVez.nombre, "María López");

  storage.touchAlexaUsuario("amzn1.ask.account.ABC", "es-MX");
  const link = storage.getAlexaUsuario("amzn1.ask.account.ABC");
  assert.equal(link?.locale, "es-MX");

  const med = storage.upsertMedicamento(creado.sessionId, "Losartán", "08:00");
  assert.equal(med.created, true);
  const actualizado = storage.upsertMedicamento(creado.sessionId, "losartán", "20:00");
  assert.equal(actualizado.created, false);
  assert.equal(storage.getMedicamentos(creado.sessionId)[0].horario, "20:00");

  storage.addMensaje(creado.sessionId, "user", "hola", 0);
  const web = storage.createUsuario("web-1", "Juan");
  assert.equal(web.nombre, "Juan");

  const vacio = storage.getPerfil(creado.sessionId);
  assert.equal(vacio.apodo, "");
  storage.savePerfil(creado.sessionId, { apodo: "Queta", temas: "cocina" }, "replace");
  storage.savePerfil(creado.sessionId, { temas: "chisme" }, "append");
  storage.savePerfil(creado.sessionId, { temas: "Chisme" }, "append");
  const perfil = storage.getPerfil(creado.sessionId);
  assert.equal(perfil.apodo, "Queta");
  assert.equal(perfil.temas, "cocina, chisme");

  storage.saveMemoria(creado.sessionId, "Le gusta la cocina.", 4);
  assert.equal(storage.getMemoria(creado.sessionId)?.hastaOrden, 4);

  storage.deleteUsuario(creado.sessionId);
  assert.equal(storage.getAlexaUsuario("amzn1.ask.account.ABC"), undefined);
  assert.equal(storage.getMensajes(creado.sessionId).length, 0);
  assert.equal(storage.getPerfil(creado.sessionId).apodo, "");
  assert.equal(storage.getMemoria(creado.sessionId), undefined);
  assert.ok(storage.getUsuario("web-1"));
});
