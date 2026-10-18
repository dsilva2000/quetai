import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAlexaRequest, type AlexaMemory } from "./handler.ts";
import type { AlexaRequestBody, AlexaResponseBody } from "./types.ts";

const SKILL = "amzn1.ask.skill.test";
const AHORA = new Date("2026-10-18T15:00:00.000Z"); // 10:00 en Lima

function memoria(seed?: { nombre?: string; apodo?: string; titulares?: { tema: "farandula" | "politica" | "actualidad"; titulo: string }[] }): AlexaMemory & {
  saved: { nombre: string; horario: string }[];
  frases: string[];
  flag: { cleared: boolean };
  apodos: string[];
  temas: string[];
  evitar: string[];
  familia: string[];
  progresos: { n: number };
} {
  const state = {
    user: seed?.nombre ? { sessionId: "alexa:user-1", nombre: seed.nombre, apodo: seed.apodo } : null as { sessionId: string; nombre: string; apodo?: string } | null,
    meds: [] as { nombre: string; horario: string }[],
    frases: [] as string[],
    flag: { cleared: false },
    saved: [] as { nombre: string; horario: string }[],
    apodos: [] as string[],
    temas: [] as string[],
    evitar: [] as string[],
    familia: [] as string[],
    titulares: seed?.titulares || [],
    progresos: { n: 0 },
  };
  const api: AlexaMemory = {
    findUser() {
      return state.user;
    },
    registerUser(_id, nombre) {
      state.user = { sessionId: "alexa:user-1", nombre, nombrePendiente: false };
      return state.user;
    },
    asegurarUsuario() {
      if (!state.user) state.user = { sessionId: "alexa:user-1", nombre: "", nombrePendiente: true };
      return state.user;
    },
    setNombre(_session, nombre) {
      if (!state.user) state.user = { sessionId: "alexa:user-1", nombre, nombrePendiente: false };
      else state.user = { ...state.user, nombre, nombrePendiente: false };
    },
    touch() {},
    listMedicamentos() {
      return state.meds;
    },
    saveMedicamento(_session, nombre, horario) {
      state.saved.push({ nombre, horario });
      state.meds = state.meds.filter((m) => m.nombre !== nombre).concat([{ nombre, horario }]);
      return { created: state.saved.length === 1 };
    },
    anotarIntercambio() {},
    clearConversacion() {
      state.flag.cleared = true;
    },
    async conversar(_session, mensaje) {
      state.frases.push(mensaje);
      if (mensaje === "falla") throw new Error("llm");
      return `Qué bonito, María. ${mensaje}. ¿Y cómo siguió?`;
    },
    setApodo(_session, apodo) {
      state.apodos.push(apodo);
      if (state.user) state.user = { ...state.user, apodo };
    },
    agregarTema(_session, tema) {
      state.temas.push(tema);
    },
    agregarEvitar(_session, tema) {
      state.evitar.push(tema);
    },
    agregarFamilia(_session, texto) {
      state.familia.push(texto);
    },
    async titulares() {
      return state.titulares;
    },
  };
  return Object.assign(api, {
    frases: state.frases,
    saved: state.saved,
    flag: state.flag,
    apodos: state.apodos,
    temas: state.temas,
    evitar: state.evitar,
    familia: state.familia,
    progresos: state.progresos,
  });
}

function pedido(parcial: {
  type?: string;
  intent?: string;
  slots?: Record<string, string>;
  attributes?: Record<string, string>;
  userId?: string | null;
  skillId?: string;
  consent?: string | null;
  transcript?: string;
}): AlexaRequestBody {
  const slots: AlexaRequestBody["request"] = {};
  const intentSlots: Record<string, { value: string }> = {};
  for (const [name, value] of Object.entries(parcial.slots || {})) intentSlots[name] = { value };
  return {
    version: "1.0",
    session: {
      application: { applicationId: parcial.skillId ?? SKILL },
      attributes: parcial.attributes || {},
      user: { userId: parcial.userId === null ? undefined : (parcial.userId || "user-1") },
    },
    context: {
      System: {
        application: { applicationId: parcial.skillId ?? SKILL },
        user: {
          userId: parcial.userId === null ? undefined : (parcial.userId || "user-1"),
          permissions: { consentToken: parcial.consent ?? null },
        },
        apiEndpoint: "https://api.amazonalexa.com",
        apiAccessToken: parcial.consent ? "token" : undefined,
      },
    },
    request: {
      type: parcial.type || "IntentRequest",
      timestamp: AHORA.toISOString(),
      locale: "es-US",
      transcript: parcial.transcript,
      intent: parcial.intent
        ? { name: parcial.intent, slots: intentSlots }
        : undefined,
    },
  };
}

function ssml(result: { body: unknown }): string {
  const body = result.body as AlexaResponseBody;
  return body.response.outputSpeech?.ssml || "";
}

function repromptDe(result: { body: unknown }): string {
  const body = result.body as AlexaResponseBody;
  return body.response.reprompt?.outputSpeech?.ssml || "";
}

test("el primer saludo pide el nombre y no cierra la sesión", async () => {
  const mem = memoria();
  const res = await handleAlexaRequest(pedido({ type: "LaunchRequest" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
    timeZone: "America/Lima",
  });
  assert.equal(res.status, 200);
  const body = res.body as AlexaResponseBody;
  assert.match(ssml(res), /Cómo te llamas/);
  assert.match(ssml(res), /rate="slow"/);
  assert.equal(body.response.shouldEndSession, false);
  assert.equal(body.sessionAttributes?.esperandoNombre, "si");
  assert.ok(body.response.reprompt);
});

test("guarda el nombre y saluda de mañana en Lima", async () => {
  const mem = memoria();
  const res = await handleAlexaRequest(
    pedido({
      intent: "DecirNombreIntent",
      slots: { nombre: "María" },
      attributes: { esperandoNombre: "si" },
    }),
    { memory: mem, skillId: SKILL, now: () => AHORA, timeZone: "America/Lima" },
  );
  assert.match(ssml(res), /Buenos días, María/);
  assert.equal(mem.findUser("user-1")?.nombre, "María");
});

test("un saludo suelto no se guarda como nombre y se conversa", async () => {
  const mem = memoria();
  const res = await handleAlexaRequest(
    pedido({ intent: "ConversarIntent", slots: { frase: "hola" }, attributes: { esperandoNombre: "si" } }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.equal(mem.findUser("x")?.nombre, "");
  assert.equal(mem.findUser("x")?.nombrePendiente, true);
  assert.deepEqual(mem.frases, ["hola"]);
  assert.match(repromptDe(res), /cómo te llamas/i);
  assert.equal((res.body as AlexaResponseBody).sessionAttributes?.esperandoNombre, "si");
  assert.equal(/buenos días, hola/i.test(ssml(res)), false);
});

test("cómo estás no se anota como nombre", async () => {
  const mem = memoria();
  const res = await handleAlexaRequest(
    pedido({
      intent: "DecirNombreIntent",
      slots: { nombre: "Cómo" },
      attributes: { esperandoNombre: "si" },
    }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.equal(mem.findUser("x")?.nombre, "");
  assert.deepEqual(mem.frases, ["cómo estás"]);
  assert.equal(/buenas noches, cómo/i.test(ssml(res)), false);
  assert.match(repromptDe(res), /cómo te llamas/i);
});

test("quien ya está registrado recibe el saludo con su nombre", async () => {
  const mem = memoria({ nombre: "Rosa" });
  const res = await handleAlexaRequest(pedido({ type: "LaunchRequest" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
    timeZone: "America/Lima",
  });
  assert.match(ssml(res), /Buenos días, Rosa/);
});

test("la frase libre llama a la conversación de Quetai", async () => {
  const mem = memoria({ nombre: "María" });
  const res = await handleAlexaRequest(
    pedido({ intent: "ConversarIntent", slots: { frase: "vinieron mis nietos" } }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.deepEqual(mem.frases, ["vinieron mis nietos"]);
  assert.match(ssml(res), /vinieron mis nietos/);
  assert.equal(ssml(res).includes("😊"), false);
});

test("si el modelo falla, responde con calma", async () => {
  const mem = memoria({ nombre: "María" });
  const res = await handleAlexaRequest(
    pedido({ intent: "ConversarIntent", slots: { frase: "falla" } }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.match(ssml(res), /pequeño tropiezo/);
  assert.equal((res.body as AlexaResponseBody).response.shouldEndSession, false);
});

test("sin nombre, la charla empieza con Amigo", async () => {
  const mem = memoria();
  const res = await handleAlexaRequest(
    pedido({ intent: "CharlarIntent" }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.match(ssml(res), /Amigo, aquí estoy/);
});

test("fallback, ayuda, repetir y parar", async () => {
  const mem = memoria({ nombre: "María" });
  const deps = { memory: mem, skillId: SKILL, now: () => AHORA, timeZone: "America/Lima" };
  const fallback = await handleAlexaRequest(pedido({ intent: "AMAZON.FallbackIntent" }), deps);
  assert.match(ssml(fallback), /María/);
  assert.match(ssml(fallback), /Cuéntame otra vez/);
  assert.equal(mem.frases.length, 0);

  const ayuda = await handleAlexaRequest(pedido({ intent: "AMAZON.HelpIntent" }), deps);
  assert.match(ssml(ayuda), /médico/);

  const primera = await handleAlexaRequest(
    pedido({ intent: "CharlarIntent" }),
    deps,
  );
  const ultima = (primera.body as AlexaResponseBody).sessionAttributes?.ultimaRespuesta;
  const repetir = await handleAlexaRequest(
    pedido({ intent: "AMAZON.RepeatIntent", attributes: { ultimaRespuesta: ultima || "" } }),
    deps,
  );
  assert.match(ssml(repetir), /aquí estoy/i);

  const paro = await handleAlexaRequest(pedido({ intent: "AMAZON.StopIntent" }), deps);
  const body = paro.body as AlexaResponseBody;
  assert.equal(body.response.shouldEndSession, true);
  assert.equal(body.response.reprompt, undefined);
  assert.match(ssml(paro), /Hasta pronto, María/);
});

test("anota el medicamento y pide permiso si Alexa no lo dio", async () => {
  const mem = memoria({ nombre: "María" });
  const res = await handleAlexaRequest(
    pedido({
      intent: "RecordarMedicamentoIntent",
      slots: { medicamento: "el losartán", hora: "08:00" },
    }),
    { memory: mem, skillId: SKILL, now: () => AHORA, timeZone: "America/Lima" },
  );
  assert.deepEqual(mem.saved, [{ nombre: "losartán", horario: "08:00" }]);
  assert.match(ssml(res), /losartán/);
  assert.match(ssml(res), /8 de la mañana/);
  assert.equal((res.body as AlexaResponseBody).response.card?.type, "AskForPermissionsConsent");
});

test("si falta la hora, la pregunta y la completa en el turno siguiente", async () => {
  const mem = memoria({ nombre: "María" });
  const deps = { memory: mem, skillId: SKILL, now: () => AHORA, timeZone: "America/Lima", crearRecordatorio: async () => "ok" as const };
  const pregunta = await handleAlexaRequest(
    pedido({ intent: "RecordarMedicamentoIntent", slots: { medicamento: "metformina" }, consent: "si" }),
    deps,
  );
  assert.match(ssml(pregunta), /A qué hora tomas metformina/);
  const attrs = (pregunta.body as AlexaResponseBody).sessionAttributes || {};
  const hecho = await handleAlexaRequest(
    pedido({
      intent: "ConversarIntent",
      slots: { frase: "a las ocho de la noche" },
      attributes: attrs,
      consent: "si",
    }),
    deps,
  );
  assert.deepEqual(mem.saved, [{ nombre: "metformina", horario: "20:00" }]);
  assert.match(ssml(hecho), /dispositivo/);
  assert.equal((hecho.body as AlexaResponseBody).response.card, undefined);
});

test("lista los medicamentos y puede olvidar la charla", async () => {
  const mem = memoria({ nombre: "María" });
  mem.saveMedicamento("alexa:user-1", "losartán", "08:00");
  const lista = await handleAlexaRequest(pedido({ intent: "ListarMedicamentosIntent" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.match(ssml(lista), /losartán/);
  const olvido = await handleAlexaRequest(pedido({ intent: "OlvidarConversacionIntent" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.equal(mem.flag.cleared, true);
  assert.match(ssml(olvido), /Olvidé la charla reciente/);
});

test("un skill id distinto se rechaza", async () => {
  const res = await handleAlexaRequest(pedido({ type: "LaunchRequest", skillId: "otra" }), {
    memory: memoria(),
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.equal(res.status, 400);
});

test("el chisme usa titulares y no llama al modelo", async () => {
  const mem = memoria({
    nombre: "María",
    titulares: [{ tema: "farandula", titulo: "Cantante peruana anuncia gira" }],
  });
  let progresos = 0;
  const res = await handleAlexaRequest(pedido({ intent: "ChismeIntent" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
    progreso: async () => { progresos += 1; },
  });
  assert.equal(mem.frases.length, 0);
  assert.equal(progresos, 0);
  assert.match(ssml(res), /cantante peruana anuncia gira/i);
  assert.match(ssml(res), /te enteraste/i);
  assert.match(ssml(res), /Dicen que/);
  assert.match(ssml(res), /más/);
});

test("el chisme no lee redes ni la frecuencia de la radio", async () => {
  const mem = memoria({
    nombre: "Enriqueta",
    apodo: "Queta",
    titulares: [
      {
        tema: "farandula",
        titulo: "LOÚLTIMO | Luto en la farándula peruana: falleció la actriz. 95.5 FM 6.1 señal digital abierta Movistar: 34 SD - - Facebook",
      },
      {
        tema: "farandula",
        titulo: "Cantante peruana anuncia una gira por Lima - RPP",
      },
    ],
  });
  const res = await handleAlexaRequest(pedido({ intent: "ChismeIntent" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  const dicho = ssml(res);
  assert.match(dicho, /Queta/);
  assert.match(dicho, /te enteraste/i);
  assert.match(dicho, /gira por Lima/);
  assert.match(dicho, /Según RPP/);
  assert.equal(/facebook|instagram|95\.5|LOÚLTIMO/i.test(dicho), false);
});

test("la política no toma partido y no inventa si no hay titulares", async () => {
  const mem = memoria({ nombre: "María", titulares: [] });
  const vacio = await handleAlexaRequest(pedido({ intent: "PoliticaIntent" }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.match(ssml(vacio), /no voy a inventar/i);
  const conDato = memoria({
    nombre: "María",
    titulares: [{ tema: "politica", titulo: "El Congreso debatió el presupuesto" }],
  });
  const res = await handleAlexaRequest(pedido({ intent: "PoliticaIntent" }), {
    memory: conDato,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.match(ssml(res), /sin tomar partido/);
  assert.match(ssml(res), /presupuesto/);
});

test("dime un apodo lo guarda", async () => {
  const mem = memoria({ nombre: "María" });
  const res = await handleAlexaRequest(pedido({ intent: "CambiarApodoIntent", slots: { apodo: "Queta" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.deepEqual(mem.apodos, ["Queta"]);
  assert.match(ssml(res), /te digo Queta/);
});

test("un gusto conserva el artículo y usa el apodo", async () => {
  const mem = memoria({ nombre: "Enriqueta", apodo: "Queta" });
  const res = await handleAlexaRequest(pedido({ intent: "GustosIntent", slots: { tema: "el chisme" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.deepEqual(mem.temas, ["el chisme"]);
  assert.equal(mem.frases.length, 0);
  assert.match(ssml(res), /Anotado, Queta/);
  assert.match(ssml(res), /Te gusta el chisme/);
  assert.equal(ssml(res).includes("Enriqueta"), false);
});

test("di me queta guarda el apodo con mayúscula", async () => {
  const mem = memoria({ nombre: "Enriqueta" });
  const res = await handleAlexaRequest(pedido({ intent: "CambiarApodoIntent", slots: { apodo: "queta" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.deepEqual(mem.apodos, ["Queta"]);
  assert.match(ssml(res), /te digo Queta/);
});

test("me llamo y dime corrigen el nombre en cualquier momento", async () => {
  const mem = memoria({ nombre: "Cómo" });
  const porNombre = await handleAlexaRequest(
    pedido({ intent: "ConversarIntent", slots: { frase: "me llamo Enriqueta" } }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.equal(mem.frases.length, 0);
  assert.equal(mem.findUser("x")?.nombre, "Enriqueta");
  assert.match(ssml(porNombre), /Enriqueta/);
  const porApodo = await handleAlexaRequest(
    pedido({ intent: "AMAZON.FallbackIntent", transcript: "dime Queta" }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.deepEqual(mem.apodos, ["Queta"]);
  assert.match(ssml(porApodo), /Queta/);
  assert.equal(mem.frases.length, 0);
});

test("una frase libre sin ranura entra a la charla si hay transcripción", async () => {
  const mem = memoria({ nombre: "María" });
  const res = await handleAlexaRequest(
    pedido({ intent: "AMAZON.FallbackIntent", transcript: "hoy fui al mercado y compré mangos" }),
    { memory: mem, skillId: SKILL, now: () => AHORA },
  );
  assert.deepEqual(mem.frases, ["hoy fui al mercado y compré mangos"]);
  assert.match(ssml(res), /mangos/);
});

test("me llamo no entra a la conversación y usa el apodo", async () => {
  const mem = memoria({ nombre: "Enriqueta", apodo: "Queta" });
  const porIntent = await handleAlexaRequest(pedido({ intent: "DecirNombreIntent", slots: { nombre: "Enriqueta" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.equal(mem.frases.length, 0);
  assert.match(ssml(porIntent), /Queta/);
  assert.match(ssml(porIntent), /Enriqueta/);
  const porFrase = await handleAlexaRequest(pedido({ intent: "ConversarIntent", slots: { frase: "me llamo Enriqueta" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
  });
  assert.equal(mem.frases.length, 0);
  assert.match(ssml(porFrase), /Queta, te tengo como Enriqueta/);
});

test("la charla libre avisa antes y llama al modelo", async () => {
  const mem = memoria({ nombre: "María" });
  let progresos = 0;
  const res = await handleAlexaRequest(pedido({ intent: "ConversarIntent", slots: { frase: "hoy caminé" } }), {
    memory: mem,
    skillId: SKILL,
    now: () => AHORA,
    progreso: async () => { progresos += 1; },
  });
  assert.equal(progresos, 1);
  assert.deepEqual(mem.frases, ["hoy caminé"]);
  assert.match(ssml(res), /caminé/);
});

test("SessionEnded responde vacío", async () => {
  const res = await handleAlexaRequest(pedido({ type: "SessionEndedRequest" }), {
    memory: memoria(),
    skillId: SKILL,
  });
  assert.equal(res.status, 200);
  assert.deepEqual((res.body as AlexaResponseBody).response, {});
});
