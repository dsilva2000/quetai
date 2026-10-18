import assert from "node:assert/strict";
import { test } from "node:test";
import { nombreAsistente, nombreHablado, noticiasActivas } from "./brand.ts";
import { modeloFallback, modeloPrincipal, timeoutAlexaMs } from "./llm.ts";

test("el nombre del asistente sale del entorno", () => {
  assert.equal(nombreAsistente({}), "Quetai");
  assert.equal(nombreAsistente({ ASSISTANT_NAME: "  Luli  " }), "Luli");
});

test("el apodo gana al nombre legal", () => {
  assert.equal(nombreHablado("María López", "Queta"), "Queta");
  assert.equal(nombreHablado("María López", "  "), "María");
  assert.equal(nombreHablado("", ""), "amigo");
});

test("las noticias se apagan solo con false", () => {
  assert.equal(noticiasActivas({}), true);
  assert.equal(noticiasActivas({ NEWS_ENABLED: "false" }), false);
});

test("el modelo principal y el fallback se configuran por entorno", () => {
  assert.equal(modeloPrincipal({}), "llama-3.3-70b-versatile");
  assert.equal(modeloPrincipal({ LLM_MODEL: "llama-grande" }), "llama-grande");
  assert.equal(modeloFallback({}), "llama-3.1-8b-instant");
  assert.equal(timeoutAlexaMs({}), 5500);
  assert.equal(timeoutAlexaMs({ ALEXA_LLM_TIMEOUT_MS: "no" }), 5500);
});
