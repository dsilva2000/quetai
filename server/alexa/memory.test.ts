import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "quetai-alexa-"));
process.env.DATA_DIR = dir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;

test("vincula un usuario de Alexa y recuerda medicamentos en su sesión", async () => {
  const { storage } = await import("../storage.ts");
  const creado = await storage.registerAlexaUsuario("amzn1.ask.account.ABC", "María López", "es-US");
  assert.equal(creado.nombre, "María López");
  assert.equal(creado.sessionId, "alexa:amzn1.ask.account.ABC");

  const otraVez = await storage.registerAlexaUsuario("amzn1.ask.account.ABC", "Otra", "es-MX");
  assert.equal(otraVez.nombre, "María López");

  await storage.touchAlexaUsuario("amzn1.ask.account.ABC", "es-MX");
  const link = await storage.getAlexaUsuario("amzn1.ask.account.ABC");
  assert.equal(link?.locale, "es-MX");

  const med = await storage.upsertMedicamento(creado.sessionId, "Losartán", "08:00");
  assert.equal(med.created, true);
  const actualizado = await storage.upsertMedicamento(creado.sessionId, "losartán", "20:00");
  assert.equal(actualizado.created, false);
  assert.equal((await storage.getMedicamentos(creado.sessionId))[0].horario, "20:00");

  await storage.addMensaje(creado.sessionId, "user", "hola", 0);
  const web = await storage.createUsuario("web-1", "Juan");
  assert.equal(web.nombre, "Juan");

  const vacio = await storage.getPerfil(creado.sessionId);
  assert.equal(vacio.apodo, "");
  await storage.savePerfil(creado.sessionId, { apodo: "Queta", temas: "cocina" }, "replace");
  await storage.savePerfil(creado.sessionId, { temas: "chisme" }, "append");
  await storage.savePerfil(creado.sessionId, { temas: "Chisme" }, "append");
  const perfil = await storage.getPerfil(creado.sessionId);
  assert.equal(perfil.apodo, "Queta");
  assert.equal(perfil.temas, "cocina, chisme");

  await storage.setNombreUsuario(creado.sessionId, "Enriqueta");
  assert.equal((await storage.getAlexaUsuario("amzn1.ask.account.ABC"))?.nombre, "Enriqueta");

  await storage.saveMemoria(creado.sessionId, "Le gusta la cocina.", 4);
  assert.equal((await storage.getMemoria(creado.sessionId))?.hastaOrden, 4);

  await storage.deleteUsuario(creado.sessionId);
  assert.equal(await storage.getAlexaUsuario("amzn1.ask.account.ABC"), undefined);
  assert.equal((await storage.getMensajes(creado.sessionId)).length, 0);
  assert.equal((await storage.getPerfil(creado.sessionId)).apodo, "");
  assert.equal(await storage.getMemoria(creado.sessionId), undefined);
  assert.ok(await storage.getUsuario("web-1"));
});
