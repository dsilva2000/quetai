import { extraerNombre, horaParaVoz, limpiarMedicamento, pareceHora, parseHoraLibre } from "./hora";
import { crearRecordatorioDiario, partesEnZona } from "./reminder";
import { limpiarParaVoz, localeVoz, toSsml } from "./ssml";
import type { AlexaRequestBody, AlexaResponseBody } from "./types";

const PERMISO_RECORDATORIOS = "alexa::alerts:reminders:skill:readwrite";

export interface AlexaMemory {
  findUser(alexaUserId: string): { sessionId: string; nombre: string } | null;
  registerUser(alexaUserId: string, nombre: string, locale: string): { sessionId: string; nombre: string };
  touch(alexaUserId: string, locale: string): void;
  listMedicamentos(sessionId: string): { nombre: string; horario: string }[];
  saveMedicamento(sessionId: string, nombre: string, horario: string): { created: boolean };
  anotarIntercambio(sessionId: string, usuario: string, asistente: string): void;
  clearConversacion(sessionId: string): void;
  conversar(sessionId: string, mensaje: string): Promise<string>;
}

export interface HandlerResult {
  status: number;
  body: AlexaResponseBody | { error: string };
}

export interface HandlerDeps {
  memory: AlexaMemory;
  skillId?: string;
  now?: () => Date;
  timeZone?: string;
  crearRecordatorio?: typeof crearRecordatorioDiario;
}

function attrsDe(body: AlexaRequestBody): Record<string, string> {
  const raw = body.session?.attributes || {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

function userIdDe(body: AlexaRequestBody): string | null {
  return body.context?.System?.user?.userId || body.session?.user?.userId || null;
}

function appIdDe(body: AlexaRequestBody): string | undefined {
  return body.context?.System?.application?.applicationId || body.session?.application?.applicationId;
}

function slot(body: AlexaRequestBody, nombre: string): string {
  return body.request?.intent?.slots?.[nombre]?.value?.trim() || "";
}

function textoLibre(body: AlexaRequestBody): string {
  return slot(body, "frase") || slot(body, "consulta") || slot(body, "nombre") || "";
}

function saludo(nombre: string, now: Date, timeZone: string): string {
  const h = partesEnZona(now, timeZone).hour;
  const parte = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
  const primer = nombre.split(" ")[0];
  return `${parte}, ${primer}. Soy Quetai. Qué gusto escucharte. ¿Cómo estás hoy?`;
}

function hablar(
  texto: string,
  opts: {
    locale?: string;
    reprompt?: string;
    end?: boolean;
    attributes?: Record<string, string>;
    cardPermisos?: boolean;
  } = {},
): HandlerResult {
  const end = !!opts.end;
  const attributes = { ...(opts.attributes || {}) };
  if (!end) attributes.ultimaRespuesta = limpiarParaVoz(texto).slice(0, 500);
  const response: AlexaResponseBody["response"] = {
    outputSpeech: { type: "SSML", ssml: toSsml(texto, opts.locale) },
    shouldEndSession: end,
  };
  if (!end) {
    const reprompt = opts.reprompt || "Sigo aquí. ¿Quieres contarme algo más?";
    response.reprompt = { outputSpeech: { type: "SSML", ssml: toSsml(reprompt, opts.locale) } };
  }
  if (opts.cardPermisos) {
    response.card = { type: "AskForPermissionsConsent", permissions: [PERMISO_RECORDATORIOS] };
  }
  return {
    status: 200,
    body: { version: "1.0", sessionAttributes: attributes, response },
  };
}

export async function handleAlexaRequest(body: AlexaRequestBody, deps: HandlerDeps): Promise<HandlerResult> {
  const skillId = deps.skillId || "";
  if (skillId) {
    const appId = appIdDe(body);
    if (appId !== skillId) return { status: 400, body: { error: "skill id no coincide" } };
  }

  const tipo = body.request?.type || "";
  const locale = localeVoz(body.request?.locale);
  const now = deps.now ? deps.now() : new Date();

  if (tipo === "SessionEndedRequest") {
    return { status: 200, body: { version: "1.0", response: {} } };
  }

  if (tipo !== "LaunchRequest" && tipo !== "IntentRequest") {
    return hablar("No te entendí. Di: abre Quetai, para empezar.", { locale, end: true });
  }

  const alexaUserId = userIdDe(body);
  if (!alexaUserId) {
    return hablar("No pude reconocer este dispositivo. Inténtalo de nuevo en un momento.", { locale, end: true });
  }

  const attributes = attrsDe(body);
  const timeZone = deps.timeZone || "America/Lima";
  let usuario = deps.memory.findUser(alexaUserId);
  if (usuario) deps.memory.touch(alexaUserId, locale);

  if (tipo === "LaunchRequest") {
    if (!usuario) {
      return hablar("Hola. Soy Quetai, tu compañero para conversar. ¿Cómo te llamas?", {
        locale,
        reprompt: "Dime tu nombre. Por ejemplo: me llamo María.",
        attributes: { ...attributes, esperandoNombre: "si" },
      });
    }
    const next = { ...attributes };
    delete next.esperandoNombre;
    return hablar(saludo(usuario.nombre, now, timeZone), { locale, attributes: next });
  }

  const intent = body.request?.intent?.name || "";

  if (intent === "AMAZON.CancelIntent" && attributes.medPendiente) {
    const next = { ...attributes };
    delete next.medPendiente;
    return hablar("Está bien. No anoté ese medicamento. ¿De qué quieres hablar?", { locale, attributes: next });
  }

  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent" || intent === "AMAZON.NavigateHomeIntent") {
    const primer = usuario?.nombre.split(" ")[0] || "";
    const despedida = primer
      ? `Hasta pronto, ${primer}. Aquí estaré cuando quieras conversar.`
      : "Hasta pronto. Aquí estaré cuando quieras conversar.";
    return hablar(despedida, { locale, end: true, attributes });
  }

  if (intent === "AMAZON.HelpIntent") {
    return hablar(
      "Puedes conversar conmigo de tu familia, la comida o cómo te sientes. También puedes decir: recuérdame tomar mi pastilla a las ocho de la mañana. No soy un médico. Si te sientes mal, llama a un familiar o a emergencias. ¿De qué quieres hablar?",
      { locale, reprompt: "¿De qué quieres hablar?", attributes },
    );
  }

  if (intent === "AMAZON.RepeatIntent") {
    const previa = attributes.ultimaRespuesta;
    if (!previa) {
      return hablar("Todavía no te he dicho nada. ¿Cómo estás hoy?", { locale, attributes });
    }
    return hablar(previa, { locale, attributes });
  }

  if (!usuario) {
    const posible = extraerNombre(textoLibre(body) || slot(body, "nombre"));
    if (attributes.esperandoNombre === "si" && posible) {
      usuario = deps.memory.registerUser(alexaUserId, posible, locale);
      const next = { ...attributes };
      delete next.esperandoNombre;
      return hablar(
        `${saludo(posible, now, timeZone)} Cuando quieras, cuéntame de tu día. Si tomas algún medicamento, dime a qué hora.`,
        { locale, attributes: next },
      );
    }
    return hablar("Todavía no sé tu nombre. Dime: me llamo, y tu nombre.", {
      locale,
      reprompt: "Por ejemplo: me llamo Juan.",
      attributes: { ...attributes, esperandoNombre: "si" },
    });
  }

  if (intent === "OlvidarConversacionIntent") {
    deps.memory.clearConversacion(usuario.sessionId);
    const primer = usuario.nombre.split(" ")[0];
    return hablar(`Listo, ${primer}. Olvidé nuestra charla. Tus medicamentos siguen guardados. ¿De qué hablamos ahora?`, {
      locale,
      attributes,
    });
  }

  if (intent === "CharlarIntent") {
    const primer = usuario.nombre.split(" ")[0];
    return hablar(`${primer}, aquí estoy. Cuéntame cómo te fue hoy, o de alguien de tu familia.`, {
      locale,
      attributes,
    });
  }

  if (intent === "ListarMedicamentosIntent") {
    return hablar(textoMedicamentos(usuario.nombre, deps.memory.listMedicamentos(usuario.sessionId)), {
      locale,
      attributes,
    });
  }

  const pendiente = attributes.medPendiente || "";
  const horaSlot = slot(body, "hora");
  const medSlot = limpiarMedicamento(slot(body, "medicamento"));

  if (intent === "RecordarMedicamentoIntent") {
    const med = medSlot || pendiente;
    const horario = parseHoraLibre(horaSlot);
    if (!med) {
      return hablar("Dime el nombre del medicamento y la hora. Por ejemplo: recuérdame tomar losartán a las ocho de la mañana.", {
        locale,
        attributes,
      });
    }
    if (!horario) {
      return hablar(`¿A qué hora tomas ${med}?`, {
        locale,
        reprompt: `Dime la hora de ${med}. Por ejemplo: a las ocho de la mañana.`,
        attributes: { ...attributes, medPendiente: med },
      });
    }
    return guardarMedicamento(body, deps, {
      usuario,
      locale,
      attributes,
      medicamento: med,
      horario,
      now,
    });
  }

  if (pendiente) {
    const horaTexto = textoLibre(body);
    const horario = pareceHora(horaTexto) ? parseHoraLibre(horaTexto) : null;
    if (horario) {
      return guardarMedicamento(body, deps, {
        usuario,
        locale,
        attributes,
        medicamento: pendiente,
        horario,
        now,
      });
    }
  }

  if (intent === "AMAZON.YesIntent" || intent === "AMAZON.NoIntent") {
    const primer = usuario.nombre.split(" ")[0];
    return hablar(`Cuéntame, ${primer}. ¿Cómo te fue hoy?`, { locale, attributes });
  }

  const frase = textoLibre(body);
  if (!frase || intent === "AMAZON.FallbackIntent") {
    return hablar("No te escuché bien. Repítelo despacio, por favor.", {
      locale,
      reprompt: "Te escucho. ¿Qué quieres contarme?",
      attributes,
    });
  }

  try {
    const respuesta = await deps.memory.conversar(usuario.sessionId, frase);
    return hablar(respuesta, { locale, attributes });
  } catch (err: any) {
    console.error("[alexa] conversar:", err?.message || err);
    const primer = usuario.nombre.split(" ")[0];
    return hablar(`Ay, ${primer}, tuve un pequeño tropiezo. ¿Me lo repites?`, { locale, attributes });
  }
}

function textoMedicamentos(nombre: string, meds: { nombre: string; horario: string }[]): string {
  const primer = nombre.split(" ")[0];
  if (meds.length === 0) {
    return `${primer}, todavía no tengo medicamentos anotados. Puedes decir: recuérdame tomar losartán a las ocho de la mañana.`;
  }
  const lista = meds
    .slice(0, 5)
    .map((m) => `${m.nombre}, a las ${horaParaVoz(m.horario)}`)
    .join(". ");
  const extra = meds.length > 5 ? " Tienes algunos más anotados." : "";
  return `${primer}, estos son tus recordatorios. ${lista}.${extra} ¿Quieres agregar otro?`;
}

async function guardarMedicamento(
  body: AlexaRequestBody,
  deps: HandlerDeps,
  ctx: {
    usuario: { sessionId: string; nombre: string };
    locale: string;
    attributes: Record<string, string>;
    medicamento: string;
    horario: string;
    now: Date;
  },
): Promise<HandlerResult> {
  const { usuario, locale, horario, now } = ctx;
  const medicamento = limpiarMedicamento(ctx.medicamento);
  const primer = usuario.nombre.split(" ")[0];
  const horaVoz = horaParaVoz(horario);
  const saved = deps.memory.saveMedicamento(usuario.sessionId, medicamento, horario);

  const consent = body.context?.System?.user?.permissions?.consentToken;
  const token = body.context?.System?.apiAccessToken;
  const endpoint = body.context?.System?.apiEndpoint;
  let aviso = "Para avisarte en este Echo, acepta los recordatorios en la aplicación de Alexa.";
  let card = true;
  if (consent && token && endpoint && deps.crearRecordatorio) {
    const resultado = await deps.crearRecordatorio({
      apiEndpoint: endpoint,
      apiAccessToken: token,
      texto: `${primer}, es hora de tomar tu ${medicamento}.`,
      horario,
      locale,
      now,
      timeZone: deps.timeZone || "America/Lima",
    });
    if (resultado === "ok") {
      aviso = "Te avisaré en este dispositivo todos los días.";
      card = false;
    } else if (resultado === "error") {
      aviso = "El aviso en el Echo no se pudo crear ahora, pero quedó anotado.";
      card = false;
    }
  }

  const verbo = saved.created ? "Ya guardé" : "Actualicé el horario. Anoté";
  const speech = `Perfecto, ${primer}. ${verbo} que tomas ${medicamento} a las ${horaVoz}. ${aviso}`;
  const next = { ...ctx.attributes };
  delete next.medPendiente;
  try {
    deps.memory.anotarIntercambio(
      usuario.sessionId,
      `Recuérdame tomar ${medicamento} a las ${horaVoz}.`,
      speech,
    );
  } catch (err: any) {
    console.error("[alexa] no se pudo anotar el recordatorio:", err?.message || err);
  }
  return hablar(speech, { locale, attributes: next, cardPermisos: card });
}
