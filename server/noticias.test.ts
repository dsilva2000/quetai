import assert from "node:assert/strict";
import { test } from "node:test";
import {
  obtenerTitulares,
  parseRss,
  resetNoticiasCache,
  respuestaDesdeTitulares,
  urlRss,
} from "./noticias.ts";

const XML = `<?xml version="1.0"?>
<rss><channel>
  <item><title><![CDATA[Cantante peruana anuncia gira &amp; disco]]></title></item>
  <item><title>Cantante peruana anuncia gira &amp; disco</title></item>
  <item><title>Otro titular de farándula</title></item>
</channel></rss>`;

test("la url pide español latino y Perú", () => {
  const url = urlRss("politica");
  assert.match(url, /hl=es-419/);
  assert.match(url, /gl=PE/);
  assert.match(url, /pol%C3%ADtica%20Per%C3%BA|pol%C3%ADtica%20Per%C3%BA/);
});

test("parseRss limpia HTML y no repite títulos", () => {
  const items = parseRss(XML, "farandula");
  assert.equal(items.length, 2);
  assert.equal(items[0].titulo, "Cantante peruana anuncia gira & disco");
});

test("el cache dura unos 30 minutos", async () => {
  resetNoticiasCache();
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas += 1;
    return { ok: true, text: async () => XML } as Response;
  };
  const ahora = 1_000_000;
  const primero = await obtenerTitulares(["farandula"], { now: ahora, fetchImpl, env: {} });
  assert.equal(llamadas, 1);
  assert.equal(primero.length, 2);
  await obtenerTitulares(["farandula"], { now: ahora + 10 * 60 * 1000, fetchImpl, env: {} });
  assert.equal(llamadas, 1);
  await obtenerTitulares(["farandula"], { now: ahora + 31 * 60 * 1000, fetchImpl, env: {} });
  assert.equal(llamadas, 2);
  resetNoticiasCache();
});

test("sin titulares no inventa, y la política no toma partido", () => {
  const vacio = respuestaDesdeTitulares("politica", [], "Queta");
  assert.match(vacio, /no voy a inventar/i);
  const dicho = respuestaDesdeTitulares("politica", [
    { tema: "politica", titulo: "El Congreso debatió el presupuesto" },
  ], "Queta");
  assert.match(dicho, /sin tomar partido/);
  assert.match(dicho, /presupuesto/);
  assert.equal(dicho.includes("partido aprista"), false);
});

test("NEWS_ENABLED=false no consulta la red", async () => {
  resetNoticiasCache();
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas += 1;
    return { ok: true, text: async () => XML } as Response;
  };
  const items = await obtenerTitulares(["actualidad"], { fetchImpl, env: { NEWS_ENABLED: "false" } });
  assert.deepEqual(items, []);
  assert.equal(llamadas, 0);
});
