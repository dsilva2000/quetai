import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acortarOraciones,
  buildSystemPrompt,
  detectarMedicamento,
  resumirHistorial,
  tropiezoDe,
} from "./prompt.ts";

test("el prompt web no menciona el canal Alexa", () => {
  const texto = buildSystemPrompt("María López", [{ nombre: "losartán", horario: "08:00" }], "");
  assert.match(texto, /María/);
  assert.match(texto, /losartán a las 08:00/);
  assert.match(texto, /Máximo 3-4 oraciones/);
  assert.equal(texto.includes("Canal Alexa"), false);
});

test("el prompt usa apodo, memoria y no inventa noticias", () => {
  const texto = buildSystemPrompt("María López", [], "", "web", {
    apodo: "Queta",
    memoria: "Le gusta el jardín.",
    noticias: "- [Política] El Congreso debatió el presupuesto",
  });
  assert.match(texto, /Queta/);
  assert.match(texto, /Le gusta el jardín/);
  assert.match(texto, /No inventes/);
  assert.match(texto, /No apoyes a un partido/);
  assert.equal(texto.includes("Canal Alexa"), false);
});

test("el prompt de Alexa pide frases cortas y sin emojis", () => {
  const texto = buildSystemPrompt("Juan", [], "El usuario ha mencionado: el jardín", "alexa");
  assert.match(texto, /Canal Alexa/);
  assert.match(texto, /Sin emojis/);
  assert.match(texto, /Juan/);
  assert.match(texto, /el jardín/);
});

test("detectarMedicamento lee la frase de confirmación", () => {
  const med = detectarMedicamento("Perfecto, ya guardé que tomas losartán a las 8:00 de la mañana.");
  assert.deepEqual(med, { nombre: "losartán", horario: "8:00 de la mañana" });
});

test("resumirHistorial espera al menos cuatro mensajes", () => {
  assert.equal(resumirHistorial([{ rol: "user", contenido: "hola" }]), "");
  const resumen = resumirHistorial([
    { rol: "user", contenido: "el jardín" },
    { rol: "assistant", contenido: "qué lindo" },
    { rol: "user", contenido: "mis nietos" },
    { rol: "assistant", contenido: "cuéntame" },
  ]);
  assert.match(resumen, /el jardín \| mis nietos/);
});

test("el tropiezo usa el apodo", () => {
  const texto = tropiezoDe("Enriqueta", "Queta");
  assert.match(texto, /Ay, Queta/);
  assert.equal(texto.includes("Enriqueta"), false);
});

test("acortarOraciones deja como máximo tres", () => {
  const corto = acortarOraciones("Una. Dos. Tres. Cuatro.", 3);
  assert.equal(corto, "Una. Dos. Tres.");
});
