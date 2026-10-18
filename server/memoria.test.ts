import assert from "node:assert/strict";
import { test } from "node:test";
import { elegirMensajesParaMemoria, textoParaResumir } from "./memoria.ts";

function turno(orden: number, rol: string) {
  return { orden, rol, contenido: `${rol}-${orden}` };
}

test("no resume hasta salir de la ventana reciente", () => {
  const pocos = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => turno(n, n % 2 ? "assistant" : "user"));
  assert.equal(elegirMensajesParaMemoria(pocos, 0), null);
});

test("resume lo que ya no cabe en la ventana", () => {
  const mensajes = Array.from({ length: 14 }, (_, n) => turno(n, n % 2 ? "assistant" : "user"));
  const lote = elegirMensajesParaMemoria(mensajes, 0);
  assert.ok(lote);
  assert.equal(lote?.paraResumir.length, 6);
  assert.equal(lote?.nuevoHasta, 6);
  assert.match(textoParaResumir("antes", lote!.paraResumir), /Resumen anterior:\nantes/);
  assert.match(textoParaResumir("", lote!.paraResumir), /Persona: user-0/);
});
