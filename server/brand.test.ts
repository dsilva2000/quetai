import assert from "node:assert/strict";
import { test } from "node:test";
import { nombreAsistente, nombreHablado, noticiasActivas } from "./brand.ts";
import { modeloFallback, modeloPrincipal, resumenErrorLlm, timeoutAlexaMs } from "./llm.ts";

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
  assert.equal(modeloPrincipal({}), "openai/gpt-oss-120b");
  assert.equal(modeloPrincipal({ LLM_MODEL: "llama-3.3-70b-versatile" }), "openai/gpt-oss-120b");
  assert.equal(modeloPrincipal({ LLM_MODEL: "llama-grande" }), "llama-grande");
  assert.equal(modeloFallback({}), "openai/gpt-oss-20b");
  assert.equal(modeloFallback({ LLM_MODEL_FALLBACK: "llama-3.1-8b-instant" }), "openai/gpt-oss-20b");
  assert.equal(timeoutAlexaMs({}), 5500);
  assert.equal(timeoutAlexaMs({ ALEXA_LLM_TIMEOUT_MS: "no" }), 5500);
});

test("el log del LLM no incluye secretos", () => {
  const resumen = resumenErrorLlm({
    name: "APIError",
    status: 404,
    code: "model_not_found",
    message: "The model llama-3.3-70b-versatile does not exist. key sk-abcSECRET Bearer tok_123",
  });
  assert.equal(resumen.clase, "APIError");
  assert.equal(resumen.status, 404);
  assert.equal(resumen.codigo, "model_not_found");
  assert.equal(resumen.detalle.includes("sk-abcSECRET"), false);
  assert.equal(resumen.detalle.includes("tok_123"), false);
  assert.match(resumen.detalle, /does not exist/);
});
