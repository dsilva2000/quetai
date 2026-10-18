import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_RELEASE, healthPayload } from "./health.ts";

test("health incluye versión y el commit de Render", () => {
  const body = healthPayload(new Date("2026-10-18T03:15:00.000Z"), {
    TZ: "America/Lima",
    RENDER_GIT_COMMIT: "4fed567abc",
  });
  assert.equal(body.status, "ok");
  assert.equal(body.time, "2026-10-18T03:15:00.000Z");
  assert.equal(body.tz, "America/Lima");
  assert.equal(body.version, APP_RELEASE);
  assert.equal(body.commit, "4fed567abc");
});

test("sin variables de git el commit es null", () => {
  const body = healthPayload(new Date("2026-10-18T03:15:00.000Z"), { TZ: "" });
  assert.equal(body.tz, "UTC");
  assert.equal(body.commit, null);
  assert.equal(body.version, "alexa-v2");
});
