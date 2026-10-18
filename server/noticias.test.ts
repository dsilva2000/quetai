import assert from "node:assert/strict";
import { test } from "node:test";
import {
  obtenerTitulares,
  parseRss,
  prepararTitular,
  recortarEnPalabra,
  resetNoticiasCache,
  respuestaDesdeTitulares,
  solapan,
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

test("limpia el titular, quita la radio y descarta redes", () => {
  const basura = prepararTitular(
    "LOÚLTIMO | Luto en la farándula peruana: falleció la actriz. 95.5 FM 6.1 señal digital abierta Movistar: 34 SD - - Facebook",
  );
  assert.equal(basura, null);
  const instagram = prepararTitular("El debate busca mantener los principios del presupuesto - Instagram");
  assert.equal(instagram, null);
  const limpio = prepararTitular(
    "LOÚLTIMO | Luto en la farándula peruana: falleció la actriz. 95.5 FM 6.1 señal digital abierta Movistar: 34 SD - RPP",
  );
  assert.ok(limpio);
  assert.match(limpio!.titulo, /^Luto en la farándula peruana: falleció la actriz/);
  assert.equal(limpio!.medio, "RPP");
  assert.equal(/95\.5|FM|Movistar|SD|LOÚLTIMO|\|/.test(limpio!.titulo), false);
  const largo = "palabra ".repeat(40).trim();
  const corto = recortarEnPalabra(largo, 80);
  assert.ok(corto.length <= 80);
  assert.equal(corto.endsWith("palabr"), false);
  assert.ok(largo.startsWith(corto));
});

test("el rss usa solo el título y habla como un amigo", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Cantante peruana anuncia una gira por Lima - RPP</title><description>NO LEER 95.5 FM Facebook</description></item>
    <item><title>Otra nota de farándula que no entra - YouTube</title><description>desc</description></item>
    <item><title>Un segundo chisme corto del espectáculo - El Comercio</title></item>
    <item><title>Un tercer chisme que no debe leerse en voz - La República</title></item>
  </channel></rss>`;
  const items = parseRss(xml, "farandula");
  assert.equal(items.length, 3);
  assert.equal(items[0].titulo, "Cantante peruana anuncia una gira por Lima");
  assert.equal(items[0].medio, "RPP");
  assert.equal(JSON.stringify(items).includes("NO LEER"), false);
  assert.equal(JSON.stringify(items).includes("YouTube"), false);
  const dicho = respuestaDesdeTitulares("farandula", items, "Queta");
  assert.match(dicho, /¿te enteraste\? Dicen que/i);
  assert.match(dicho, /Según RPP/);
  assert.match(dicho, /Según El Comercio/);
  assert.match(dicho, /¿Quieres que te cuente más\?/);
  assert.equal(dicho.includes("tercer chisme"), false);
  assert.equal(dicho.includes("NO LEER"), false);
});

test("capitaliza, quita el dateline y no lee una URL", () => {
  const sigla = prepararTitular("CCL proyecta un alza del dólar esta semana - RPP");
  assert.match(sigla!.titulo, /^CCL proyecta/);
  assert.equal(sigla!.titulo.startsWith("cCL"), false);
  const dateline = prepararTitular("perú.- perú lanzará un satélite propio este año - Andina");
  assert.match(dateline!.titulo, /^Perú lanzará/);
  assert.equal(/^perú/.test(dateline!.titulo), false);
  const lima = prepararTitular("Lima.- El Congreso aprobó la norma fiscal hoy - El Peruano");
  assert.match(lima!.titulo, /^El Congreso/);
  const url = prepararTitular("El gobierno anunció una medida económica hoy - https://www.notiperu.com.pe/");
  assert.equal(url!.medio, "Notiperú");
  const dicho = respuestaDesdeTitulares("politica", [
    { tema: "politica", titulo: "El gobierno anunció una medida económica hoy - https://www.notiperu.com.pe/" },
  ], "Queta");
  assert.match(dicho, /Según Notiperú/);
  assert.equal(dicho.includes("http"), false);
  assert.equal(dicho.includes("notiperu.com"), false);
});

test("un titular en Title Case se lee como frase", () => {
  const listo = prepararTitular("Extorsión Golpea a la Política Nacional - RPP");
  assert.ok(listo);
  assert.equal(listo!.titulo, "Extorsión golpea a la política nacional");
  assert.equal(listo!.medio, "RPP");
  const propio = prepararTitular("El Congreso Debatió el Presupuesto en Lima - Andina");
  assert.equal(propio!.titulo, "El Congreso debatió el presupuesto en Lima");
  const dicho = respuestaDesdeTitulares("politica", [
    { tema: "politica", titulo: "Extorsión Golpea a la Política Nacional", medio: "RPP" },
  ], "Queta");
  assert.match(dicho, /Extorsión golpea a la política nacional/);
  assert.equal(/Golpea/.test(dicho), false);
});

test("no repite titulares casi iguales", () => {
  const items = [
    { tema: "politica" as const, titulo: "El MEF anuncia política fiscal contracíclica para el 2027", medio: "El Peruano" },
    { tema: "politica" as const, titulo: "Política fiscal contracíclica: el MEF dio detalles hoy", medio: "Andina" },
    { tema: "politica" as const, titulo: "Un equipo peruano ganó la copa local de fútbol", medio: "RPP" },
  ];
  assert.ok(solapan(items[0].titulo, items[1].titulo) > 0.6);
  const dicho = respuestaDesdeTitulares("politica", items, "Queta");
  assert.match(dicho, /contracíclica/);
  assert.match(dicho, /copa local/);
  assert.equal((dicho.match(/contracíclica/gi) || []).length, 1);
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
