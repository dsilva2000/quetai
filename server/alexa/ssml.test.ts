import assert from "node:assert/strict";
import { test } from "node:test";
import { limpiarParaVoz, toSsml } from "./ssml.ts";

test("el SSML va lento, escapa XML y quita emojis", () => {
  const ssml = toSsml("Hola, María. ¿Cómo estás? 😊 Tomo pan & leche.", "es-MX");
  assert.match(ssml, /<prosody rate="slow">/);
  assert.match(ssml, /xml:lang="es-MX"/);
  assert.match(ssml, /pan &amp; leche/);
  assert.equal(ssml.includes("😊"), false);
  assert.match(ssml, /<break time="350ms"\/>/);
});

test("un locale desconocido cae en es-US", () => {
  assert.match(toSsml("Hola.", "en-US"), /xml:lang="es-US"/);
});

test("limpiarParaVoz quita markdown", () => {
  assert.equal(limpiarParaVoz("**Hola** _María_"), "Hola María");
});
