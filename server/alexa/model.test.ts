import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCALES = ["es-US", "es-ES", "es-MX"];
const RAIZ = path.join(process.cwd(), "alexa/skill-package");

function modelo(locale: string) {
  return JSON.parse(readFileSync(path.join(RAIZ, "interactionModels/custom", `${locale}.json`), "utf8"));
}

test("la invocación es mi quetai en los tres idiomas", () => {
  for (const locale of LOCALES) {
    const lang = modelo(locale).interactionModel.languageModel;
    assert.equal(lang.invocationName, "mi quetai", locale);
    const nombres = lang.intents.map((intent: { name: string }) => intent.name);
    for (const requerido of ["ChismeIntent", "PoliticaIntent", "NoticiasIntent", "CambiarApodoIntent", "GustosIntent", "EvitarTemaIntent", "FamiliaIntent"]) {
      assert.ok(nombres.includes(requerido), `${locale} ${requerido}`);
    }
  }
});

test("ninguna muestra de SearchQuery es solo la ranura", () => {
  for (const locale of LOCALES) {
    const intents = modelo(locale).interactionModel.languageModel.intents as {
      name: string;
      slots?: { name: string; type: string }[];
      samples?: string[];
    }[];
    for (const intent of intents) {
      const busqueda = (intent.slots || []).filter((slot) => slot.type === "AMAZON.SearchQuery");
      for (const sample of intent.samples || []) {
        for (const slot of busqueda) {
          const marca = `{${slot.name}}`;
          assert.notEqual(sample.trim(), marca, `${locale} ${intent.name}`);
          assert.ok(sample.replace(marca, "").trim().length > 0, `${locale} ${intent.name} ${sample}`);
        }
      }
    }
  }
});

test("una ranura tiene el mismo tipo en todos los intents", () => {
  for (const locale of LOCALES) {
    const intents = modelo(locale).interactionModel.languageModel.intents as {
      name: string;
      slots?: { name: string; type: string }[];
    }[];
    const tipos = new Map<string, { type: string; intent: string }>();
    for (const intent of intents) {
      for (const slot of intent.slots || []) {
        const previo = tipos.get(slot.name);
        assert.ok(
          !previo || previo.type === slot.type,
          `${locale}: "${slot.name}" es ${previo?.type} en ${previo?.intent} y ${slot.type} en ${intent.name}`,
        );
        tipos.set(slot.name, { type: slot.type, intent: intent.name });
      }
    }
  }
});

test("SearchQuery no comparte muestra con otra ranura", () => {
  const marca = /\{([A-Za-z0-9_]+)\}/g;
  for (const locale of LOCALES) {
    const intents = modelo(locale).interactionModel.languageModel.intents as {
      name: string;
      slots?: { name: string; type: string }[];
      samples?: string[];
    }[];
    for (const intent of intents) {
      const frase = new Set(
        (intent.slots || []).filter((slot) => slot.type === "AMAZON.SearchQuery").map((slot) => slot.name),
      );
      for (const sample of intent.samples || []) {
        const usadas = [...sample.matchAll(marca)].map((m) => m[1]);
        const tieneFrase = usadas.some((nombre) => frase.has(nombre));
        if (!tieneFrase) continue;
        assert.equal(
          usadas.length,
          1,
          `${locale} ${intent.name}: "${sample}" mezcla una frase con otra ranura`,
        );
      }
    }
  }
});

test("la charla libre lleva portadores y la ranura no va sola", () => {
  const portadores = [
    "hoy {frase}",
    "fui {frase}",
    "estoy {frase}",
    "me siento {frase}",
    "sabes que {frase}",
    "te cuento que {frase}",
  ];
  for (const locale of LOCALES) {
    const lang = modelo(locale).interactionModel.languageModel;
    const intent = lang.intents.find((item: { name: string }) => item.name === "ConversarIntent");
    assert.equal(intent.slots[0].type, "AMAZON.SearchQuery", locale);
    assert.equal(intent.samples.includes("{frase}"), false, locale);
    assert.equal(intent.samples.includes("mi {frase}"), false, locale);
    for (const muestra of portadores) {
      assert.ok(intent.samples.includes(muestra), `${locale} ${muestra}`);
    }
    const tipos = lang.types.map((item: { name: string }) => item.name);
    assert.equal(tipos.includes("FRASE_LIBRE"), false, locale);
  }
});

test("el apodo tiene muestras de di me y los valores Queta y Enriqueta", () => {
  const muestras = [
    "di me {apodo}",
    "llámame {apodo}",
    "dime {apodo}",
    "quiero que me digas {apodo}",
    "me dicen {apodo}",
    "mi apodo es {apodo}",
  ];
  for (const locale of LOCALES) {
    const lang = modelo(locale).interactionModel.languageModel;
    const intent = lang.intents.find((item: { name: string }) => item.name === "CambiarApodoIntent");
    assert.equal(intent.slots[0].type, "APODO", locale);
    for (const muestra of muestras) {
      assert.ok(intent.samples.includes(muestra), `${locale} ${muestra}`);
    }
    const gustos = lang.intents.find((item: { name: string }) => item.name === "GustosIntent");
    assert.equal(gustos.samples.includes("me gusta el {tema}"), false, locale);
    const tipo = lang.types.find((item: { name: string }) => item.name === "APODO");
    const valores = tipo.values.map((item: { name: { value: string } }) => item.name.value);
    for (const nombre of ["Queta", "Quetita", "Enriqueta"]) {
      assert.ok(valores.includes(nombre), `${locale} ${nombre}`);
    }
  }
});

test("las frases de ejemplo usan la invocación de dos palabras", () => {
  const skill = JSON.parse(readFileSync(path.join(RAIZ, "skill.json"), "utf8"));
  for (const locale of LOCALES) {
    const frases = skill.manifest.publishingInformation.locales[locale].examplePhrases as string[];
    assert.ok(frases.some((f) => f.includes("abre mi quetai")), locale);
    assert.ok(frases.some((f) => f.includes("me cuente el chisme")), locale);
    assert.ok(frases.some((f) => f.includes("qué pasó en política")), locale);
    assert.equal(frases.some((f) => /abre quetai$/i.test(f)), false);
  }
});
