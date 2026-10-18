import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReminderPayload, crearRecordatorioDiario, proximaOcurrencia } from "./reminder.ts";

const AHORA = new Date("2026-10-18T20:00:00.000Z"); // 15:00 en Lima

test("la próxima toma queda en el futuro, hora de Lima", () => {
  assert.equal(proximaOcurrencia("08:00", AHORA, "America/Lima"), "2026-10-19T08:00:00.000");
  assert.equal(proximaOcurrencia("20:00", AHORA, "America/Lima"), "2026-10-18T20:00:00.000");
  assert.equal(proximaOcurrencia("15:00", AHORA, "America/Lima"), "2026-10-19T15:00:00.000");
});

test("el aviso diario no lleva emoji y usa la zona de Lima", () => {
  const payload = buildReminderPayload({
    now: AHORA,
    timeZone: "America/Lima",
    horario: "08:00",
    texto: "María, es hora de tomar tu losartán.",
    locale: "es-US",
  });
  assert.ok(payload);
  const trigger = payload!.trigger as { timeZoneId: string; recurrence: { recurrenceRules: string[] } };
  assert.equal(trigger.timeZoneId, "America/Lima");
  assert.match(trigger.recurrence.recurrenceRules[0], /FREQ=DAILY/);
  assert.match(trigger.recurrence.recurrenceRules[0], /BYHOUR=8/);
  const texto = JSON.stringify(payload);
  assert.match(texto, /María, es hora de tomar tu losartán/);
  assert.equal(texto.includes("💊"), false);
});

test("crearRecordatorioDiario lee el estado HTTP", async () => {
  const base = {
    apiEndpoint: "https://api.amazonalexa.com/",
    apiAccessToken: "token-de-prueba",
    texto: "María, es hora de tomar tu losartán.",
    horario: "08:00",
    locale: "es-US",
    now: AHORA,
    timeZone: "America/Lima",
  };
  let url = "";
  const ok = await crearRecordatorioDiario(base, async (input) => {
    url = String(input);
    return new Response("", { status: 201 });
  });
  assert.equal(ok, "ok");
  assert.equal(url, "https://api.amazonalexa.com/v1/alerts/reminders");

  const denied = await crearRecordatorioDiario(base, async () => new Response("", { status: 403 }));
  assert.equal(denied, "sin_permiso");
});
