import assert from "node:assert/strict";
import { test } from "node:test";
import { processAlexaHttp } from "./http.ts";
import type { AlexaRequestBody } from "./types.ts";

const cuerpo = Buffer.from(JSON.stringify({
  request: { type: "LaunchRequest", timestamp: "2026-10-18T15:00:00.000Z" },
}));

test("rechaza la firma sin llamar al handler", async () => {
  let llamado = false;
  const res = await processAlexaHttp({
    rawBody: cuerpo,
    signature: "firma",
    certUrl: "https://evil.example/cert.pem",
    verify: async () => ({ ok: false, status: 400, reason: "firma inválida" }),
    handle: async () => {
      llamado = true;
      return { status: 200, body: { version: "1.0", response: {} } };
    },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: "solicitud no válida" });
  assert.equal(llamado, false);
});

test("con la firma aceptada entrega el cuerpo al handler", async () => {
  let visto: AlexaRequestBody | undefined;
  const res = await processAlexaHttp({
    rawBody: cuerpo,
    signature: "firma",
    certUrl: "https://s3.amazonaws.com/echo.api/x.pem",
    verify: async () => ({ ok: true, status: 200, reason: "ok" }),
    handle: async (body) => {
      visto = body;
      return {
        status: 200,
        body: {
          version: "1.0",
          response: { outputSpeech: { type: "SSML", ssml: "<speak>Hola.</speak>" }, shouldEndSession: false },
        },
      };
    },
  });
  assert.equal(res.status, 200);
  assert.equal(visto?.request?.type, "LaunchRequest");
  assert.match(JSON.stringify(res.json), /Hola/);
});

test("cuerpo vacío o json roto", async () => {
  const vacio = await processAlexaHttp({
    rawBody: Buffer.alloc(0),
    verify: async () => ({ ok: true, status: 200, reason: "ok" }),
    handle: async () => ({ status: 200, body: { version: "1.0", response: {} } }),
  });
  assert.equal(vacio.status, 400);

  const roto = await processAlexaHttp({
    rawBody: Buffer.from("{"),
    verify: async () => {
      throw new Error("no debe verificar");
    },
    handle: async () => ({ status: 200, body: { version: "1.0", response: {} } }),
  });
  assert.equal(roto.status, 400);
});
