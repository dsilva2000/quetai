import { nombreAsistente, nombreHablado } from "../brand";
import { respuestaDesdeTitulares, type TemaNoticia, type Titular } from "../noticias";
import { extraerNombre, horaParaVoz, limpiarMedicamento, pareceHora, parseHoraLibre } from "./hora";
import { crearRecordatorioDiario, partesEnZona } from "./reminder";
import { limpiarParaVoz, localeVoz, toSsml } from "./ssml";
import type { AlexaRequestBody, AlexaResponseBody } from "./types";

const PERMISO_RECORDATORIOS = "alexa::alerts:reminders:skill:readwrite";

export type TemaVoz = TemaNoticia | "todos";

export interface UsuarioAlexa {
  sessionId: string;
  nombre: string;
  apodo?: string;
}

export interface AlexaMemory {
  findUser(alexaUserId: string): UsuarioAlexa | null;
  registerUser(alexaUserId: string, nombre: string, locale: string): UsuarioAlexa;
  touch(alexaUserId: string, locale: string): void;
  listMedicamentos(sessionId: string): { nombre: string; horario: string }[];
  saveMedicamento(sessionId: string, nombre: string, horario: string): { created: boolean };
  anotarIntercambio(sessionId: string, usuario: string, asistente: string): void;
  clearConversacion(sessionId: string): void;
  conversar(sessionId: string, mensaje: string): Promise<string>;
  setApodo(sessionId: string, apodo: string): void;
  agregarTema(sessionId: string, tema: string): void;
  agregarEvitar(sessionId: string, tema: string): void;
  agregarFamilia(sessionId: string, texto: string): void;
  titulares(tema: TemaVoz): Promise<Titular[]>;
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
  /** Aviso corto antes de una respuesta lenta. No alarga el límite de 8 segundos. */
  progreso?: (body: AlexaRequestBody) => Promise<void>;
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

function comoSeDice(usuario: { nombre: string; apodo?: string }): string {
  return nombreHablado(usuario.nombre, usuario.apodo);
}

function saludo(usuario: { nombre: string; apodo?: string }, now: Date, timeZone: string): string {
  const h = partesEnZona(now, timeZone).hour;
  const parte = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
  const asistente = nombreAsistente();
  return `${parte}, ${comoSeDice(usuario)}. Soy ${asistente}. Qué gusto escucharte. ¿Cómo estás hoy?`;
}

function limpiarApodo(raw: string): string {
  const limpio = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]/g, " ").replace(/\s+/g, " ").trim();
  const corto = limpio.split(" ").slice(0, 2).join(" ").slice(0, 24);
  return corto
    .split(" ")
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(" ");
}

function limpiarTema(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "").slice(0, 80);
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
    return hablar(`No te entendí. Di: abre ${nombreAsistente()}, para empezar.`, { locale, end: true });
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
      return hablar(`Hola. Soy ${nombreAsistente()}, tu compañero para conversar. ¿Cómo te llamas?`, {
        locale,
        reprompt: "Dime tu nombre. Por ejemplo: me llamo María.",
        attributes: { ...attributes, esperandoNombre: "si" },
      });
    }
    const next = { ...attributes };
    delete next.esperandoNombre;
    return hablar(saludo(usuario, now, timeZone), { locale, attributes: next });
  }

  const intent = body.request?.intent?.name || "";

  if (intent === "AMAZON.CancelIntent" && attributes.medPendiente) {
    const next = { ...attributes };
    delete next.medPendiente;
    return hablar("Está bien. No anoté ese medicamento. ¿De qué quieres hablar?", { locale, attributes: next });
  }

  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent" || intent === "AMAZON.NavigateHomeIntent") {
    const primer = usuario ? comoSeDice(usuario) : "";
    const despedida = primer
      ? `Hasta pronto, ${primer}. Aquí estaré cuando quieras conversar.`
      : "Hasta pronto. Aquí estaré cuando quieras conversar.";
    return hablar(despedida, { locale, end: true, attributes });
  }

  if (intent === "AMAZON.HelpIntent") {
    return hablar(
      "Puedes conversar de tu familia o la comida, pedir el chisme o la política del día, o decir cómo quieres que te llame. También: recuérdame tomar mi pastilla a las ocho de la mañana. No soy un médico. Si te sientes mal, llama a un familiar o a emergencias. ¿De qué quieres hablar?",
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
        `${saludo({ nombre: posible }, now, timeZone)} Cuando quieras, cuéntame de tu día. Si tomas algún medicamento, dime a qué hora.`,
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
    const primer = comoSeDice(usuario);
    return hablar(`Listo, ${primer}. Olvidé la charla reciente. Sigo acordándome de ti y tus medicamentos siguen guardados. ¿De qué hablamos ahora?`, {
      locale,
      attributes,
    });
  }

  if (intent === "CharlarIntent") {
    const primer = comoSeDice(usuario);
    return hablar(`${primer}, aquí estoy. Cuéntame cómo te fue hoy, o de alguien de tu familia.`, {
      locale,
      attributes,
    });
  }

  if (intent === "ListarMedicamentosIntent") {
    return hablar(textoMedicamentos(comoSeDice(usuario), deps.memory.listMedicamentos(usuario.sessionId)), {
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
    const primer = comoSeDice(usuario);
    return hablar(`Cuéntame, ${primer}. ¿Cómo te fue hoy?`, { locale, attributes });
  }

  const perfil = await responderPerfil(intent, body, deps, usuario, locale, attributes);
  if (perfil) return perfil;

  const noticias = await responderNoticias(intent, deps, usuario, locale, attributes);
  if (noticias) return noticias;

  const frase = textoLibre(body);
  if (!frase || intent === "AMAZON.FallbackIntent") {
    return hablar("No te escuché bien. Repítelo despacio, por favor.", {
      locale,
      reprompt: "Te escucho. ¿Qué quieres contarme?",
      attributes,
    });
  }

  try {
    if (deps.progreso) {
      try {
        await deps.progreso(body);
      } catch (err: any) {
        console.error("[alexa] progreso:", err?.message || err);
      }
    }
    const respuesta = await deps.memory.conversar(usuario.sessionId, frase);
    return hablar(respuesta, { locale, attributes });
  } catch (err: any) {
    console.error("[alexa] conversar:", err?.message || err);
    const primer = comoSeDice(usuario);
    return hablar(`Ay, ${primer}, tuve un pequeño tropiezo. ¿Me lo repites?`, { locale, attributes });
  }
}

async function responderPerfil(
  intent: string,
  body: AlexaRequestBody,
  deps: HandlerDeps,
  usuario: UsuarioAlexa,
  locale: string,
  attributes: Record<string, string>,
): Promise<HandlerResult | null> {
  const primer = comoSeDice(usuario);
  if (intent === "CambiarApodoIntent") {
    const apodo = limpiarApodo(slot(body, "apodo") || slot(body, "nombre"));
    if (!apodo) {
      return hablar(`${primer}, ¿cómo quieres que te diga?`, {
        locale,
        reprompt: "Dime cómo quieres que te llame.",
        attributes,
      });
    }
    deps.memory.setApodo(usuario.sessionId, apodo);
    return hablar(`Listo. Desde ahora te digo ${apodo}. ¿De qué conversamos?`, { locale, attributes });
  }
  if (intent === "GustosIntent") {
    const tema = limpiarTema(slot(body, "tema"));
    if (!tema) {
      return hablar(`${primer}, ¿de qué te gusta hablar?`, { locale, attributes });
    }
    deps.memory.agregarTema(usuario.sessionId, tema);
    return hablar(`Anotado, ${primer}. Te gusta ${tema}. ¿Qué me cuentas de eso?`, { locale, attributes });
  }
  if (intent === "EvitarTemaIntent") {
    const tema = limpiarTema(slot(body, "tema"));
    if (!tema) {
      return hablar(`${primer}, ¿qué tema prefieres que no saque?`, { locale, attributes });
    }
    deps.memory.agregarEvitar(usuario.sessionId, tema);
    return hablar(`Está bien, ${primer}. No voy a sacar el tema de ${tema}. ¿Hablamos de otra cosa?`, { locale, attributes });
  }
  if (intent === "FamiliaIntent") {
    const parentesco = limpiarTema(slot(body, "parentesco"));
    const nombre = limpiarApodo(slot(body, "nombre"));
    if (!parentesco || !nombre) {
      return hablar("Dime el parentesco y el nombre. Por ejemplo: mi nieta se llama Rosa.", { locale, attributes });
    }
    deps.memory.agregarFamilia(usuario.sessionId, `${parentesco} ${nombre}`);
    return hablar(`Qué lindo, ${primer}. Tu ${parentesco} se llama ${nombre}. ¿Cómo está?`, { locale, attributes });
  }
  return null;
}

async function responderNoticias(
  intent: string,
  deps: HandlerDeps,
  usuario: UsuarioAlexa,
  locale: string,
  attributes: Record<string, string>,
): Promise<HandlerResult | null> {
  const mapa: Record<string, TemaVoz> = {
    ChismeIntent: "farandula",
    PoliticaIntent: "politica",
    NoticiasIntent: "todos",
  };
  const tema = mapa[intent];
  if (!tema) return null;
  let items: Titular[] = [];
  try {
    items = await deps.memory.titulares(tema);
  } catch (err: any) {
    console.error("[alexa] noticias:", err?.message || err);
  }
  const texto = respuestaDesdeTitulares(tema, items, comoSeDice(usuario));
  return hablar(texto, { locale, attributes });
}

function textoMedicamentos(nombre: string, meds: { nombre: string; horario: string }[]): string {
  const primer = nombreHablado(nombre);
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
    usuario: UsuarioAlexa;
    locale: string;
    attributes: Record<string, string>;
    medicamento: string;
    horario: string;
    now: Date;
  },
): Promise<HandlerResult> {
  const { usuario, locale, horario, now } = ctx;
  const medicamento = limpiarMedicamento(ctx.medicamento);
  const primer = comoSeDice(usuario);
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
