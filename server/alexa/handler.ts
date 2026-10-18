import { capitalizarFrase, nombreAsistente, nombreHablado } from "../brand";
import { resumenErrorLlm } from "../llm";
import { respuestaDesdeTitulares, type TemaNoticia, type Titular } from "../noticias";
import { extraerNombre, horaParaVoz, limpiarMedicamento, pareceHora, parseHoraLibre, textoDeCharla } from "./hora";
import { crearRecordatorioDiario, partesEnZona } from "./reminder";
import { limpiarParaVoz, localeVoz, toSsml } from "./ssml";
import type { AlexaRequestBody, AlexaResponseBody } from "./types";

const PERMISO_RECORDATORIOS = "alexa::alerts:reminders:skill:readwrite";

export type TemaVoz = TemaNoticia | "todos";

export interface UsuarioAlexa {
  sessionId: string;
  nombre: string;
  apodo?: string;
  /** True cuando todavía no nos dijo un nombre de verdad. */
  nombrePendiente?: boolean;
}

export interface AlexaMemory {
  findUser(alexaUserId: string): Promise<UsuarioAlexa | null>;
  registerUser(alexaUserId: string, nombre: string, locale: string): Promise<UsuarioAlexa>;
  /** Crea la sesión si no existe, sin inventar un nombre. */
  asegurarUsuario(alexaUserId: string, locale: string): Promise<UsuarioAlexa>;
  setNombre(sessionId: string, nombre: string): Promise<void>;
  touch(alexaUserId: string, locale: string): Promise<void>;
  listMedicamentos(sessionId: string): Promise<{ nombre: string; horario: string }[]>;
  saveMedicamento(sessionId: string, nombre: string, horario: string): Promise<{ created: boolean }>;
  anotarIntercambio(sessionId: string, usuario: string, asistente: string): Promise<void>;
  clearConversacion(sessionId: string): Promise<void>;
  conversar(sessionId: string, mensaje: string): Promise<string>;
  setApodo(sessionId: string, apodo: string): Promise<void>;
  agregarTema(sessionId: string, tema: string): Promise<void>;
  agregarEvitar(sessionId: string, tema: string): Promise<void>;
  agregarFamilia(sessionId: string, texto: string): Promise<void>;
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

const INTENTS_CON_USUARIO = new Set([
  "RecordarMedicamentoIntent",
  "ListarMedicamentosIntent",
  "OlvidarConversacionIntent",
  "CharlarIntent",
  "ChismeIntent",
  "PoliticaIntent",
  "NoticiasIntent",
  "GustosIntent",
  "EvitarTemaIntent",
  "FamiliaIntent",
  "AMAZON.YesIntent",
  "AMAZON.NoIntent",
]);

function textoOido(body: AlexaRequestBody): string {
  const directa = (body.request?.transcript || body.request?.inputTranscript || "").replace(/\s+/g, " ").trim();
  if (directa) return directa;
  return textoLibre(body);
}

function sinNombre(usuario: UsuarioAlexa | null): boolean {
  return !usuario || !!usuario.nombrePendiente || !usuario.nombre.trim();
}

function clasificarPresentacion(
  body: AlexaRequestBody,
  attributes: Record<string, string>,
  usuario: UsuarioAlexa | null,
): { tipo: "nombre" | "apodo"; valor: string } | null {
  const intent = body.request?.intent?.name || "";
  const texto = textoOido(body);
  const apodo = texto.match(/^(?:di me|dime|llámame|llamame|puedes llamarme|quiero que me digas|prefiero que me digas)\s+(.+)$/i);
  if (apodo) {
    const valor = extraerNombre(apodo[1]);
    if (valor) return { tipo: "apodo", valor };
    if (apodo[1].trim().split(/\s+/).length < 2) return { tipo: "apodo", valor: "" };
    return null;
  }
  const nombre = texto.match(/^(?:me llamo|mi nombre es|yo me llamo|yo soy|soy)\s+(.+)$/i);
  if (nombre) {
    const valor = extraerNombre(nombre[1]);
    return valor ? { tipo: "nombre", valor } : { tipo: "nombre", valor: "" };
  }
  if (intent === "CambiarApodoIntent") {
    const valor = extraerNombre(slot(body, "apodo") || slot(body, "nombre"));
    return { tipo: "apodo", valor: valor || "" };
  }
  if (intent === "DecirNombreIntent") {
    const valor = extraerNombre(slot(body, "nombre"));
    if (valor) return { tipo: "nombre", valor };
  }
  if (attributes.esperandoNombre === "si" && sinNombre(usuario)) {
    const valor = extraerNombre(texto);
    if (valor) return { tipo: "nombre", valor };
  }
  return null;
}

async function aplicarPresentacion(
  deps: HandlerDeps,
  alexaUserId: string,
  locale: string,
  usuario: UsuarioAlexa | null,
  attributes: Record<string, string>,
  presentacion: { tipo: "nombre" | "apodo"; valor: string },
  now: Date,
  timeZone: string,
): Promise<HandlerResult> {
  const next = { ...attributes };
  if (!presentacion.valor) {
    const primer = usuario && !sinNombre(usuario) ? comoSeDice(usuario) : "";
    const pista = presentacion.tipo === "apodo"
      ? "¿Cómo quieres que te diga? Un apodo corto, como Queta."
      : "Eso no me sonó a un nombre. Dime, por ejemplo: me llamo María.";
    if (sinNombre(usuario)) next.esperandoNombre = "si";
    const voz = primer ? `${primer}. ${pista}` : pista;
    return hablar(voz, { locale, attributes: next, reprompt: "Por ejemplo: me llamo María." });
  }
  if (presentacion.tipo === "apodo") {
    const base = usuario || await deps.memory.asegurarUsuario(alexaUserId, locale);
    await deps.memory.setApodo(base.sessionId, presentacion.valor);
    delete next.esperandoNombre;
    return hablar(`Listo. Desde ahora te digo ${presentacion.valor}. ¿De qué conversamos?`, { locale, attributes: next });
  }
  const eraNuevo = sinNombre(usuario);
  const guardado = usuario || await deps.memory.registerUser(alexaUserId, presentacion.valor, locale);
  if (usuario) await deps.memory.setNombre(usuario.sessionId, presentacion.valor);
  const actualizado: UsuarioAlexa = {
    ...guardado,
    nombre: presentacion.valor,
    apodo: usuario?.apodo,
    nombrePendiente: false,
  };
  delete next.esperandoNombre;
  if (eraNuevo) {
    return hablar(
      `${saludo(actualizado, now, timeZone)} Cuando quieras, cuéntame de tu día. Si tomas algún medicamento, dime a qué hora.`,
      { locale, attributes: next },
    );
  }
  const hablado = comoSeDice(actualizado);
  if ((usuario?.nombre || "").toLowerCase() === presentacion.valor.toLowerCase()) {
    return hablar(`${hablado}, te tengo como ${presentacion.valor}. ¿Cómo estás hoy?`, { locale, attributes: next });
  }
  const prefijo = hablado.toLowerCase() === presentacion.valor.toLowerCase() ? "Listo." : `Listo, ${hablado}.`;
  return hablar(`${prefijo} Te anoté como ${presentacion.valor}. ¿Cómo estás hoy?`, { locale, attributes: next });
}

async function charlaSinNombre(
  body: AlexaRequestBody,
  deps: HandlerDeps,
  alexaUserId: string,
  locale: string,
  usuario: UsuarioAlexa | null,
  attributes: Record<string, string>,
): Promise<HandlerResult> {
  const texto = textoDeCharla(textoOido(body));
  if (!texto) {
    return hablar(`Hola. Soy ${nombreAsistente()}, tu compañero para conversar. ¿Cómo te llamas?`, {
      locale,
      reprompt: "Dime tu nombre. Por ejemplo: me llamo María.",
      attributes: { ...attributes, esperandoNombre: "si" },
    });
  }
  const base = usuario || await deps.memory.asegurarUsuario(alexaUserId, locale);
  try {
    if (deps.progreso) {
      try {
        await deps.progreso(body);
      } catch (err: any) {
        console.error("[alexa] progreso:", err?.message || err);
      }
    }
    const respuesta = await deps.memory.conversar(base.sessionId, texto);
    return hablar(respuesta, {
      locale,
      reprompt: "Cuando puedas, dime cómo te llamas.",
      attributes: { ...attributes, esperandoNombre: "si" },
    });
  } catch (err: any) {
    console.error(JSON.stringify({ evento: "alexa.conversar", ...resumenErrorLlm(err) }));
    return hablar("Ay, tuve un pequeño tropiezo. ¿Me lo repites? Y, cuando puedas, dime cómo te llamas.", {
      locale,
      attributes: { ...attributes, esperandoNombre: "si" },
    });
  }
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
  const dicho = capitalizarFrase(texto);
  const attributes = { ...(opts.attributes || {}) };
  if (!end) attributes.ultimaRespuesta = limpiarParaVoz(dicho).slice(0, 500);
  const response: AlexaResponseBody["response"] = {
    outputSpeech: { type: "SSML", ssml: toSsml(dicho, opts.locale) },
    shouldEndSession: end,
  };
  if (!end) {
    const reprompt = capitalizarFrase(opts.reprompt || "Sigo aquí. ¿Quieres contarme algo más?");
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
  let usuario = await deps.memory.findUser(alexaUserId);
  if (usuario) {
    void Promise.resolve(deps.memory.touch(alexaUserId, locale)).catch((err: any) => {
      console.error("[alexa] touch:", err?.message || err);
    });
  }

  if (tipo === "LaunchRequest") {
    if (sinNombre(usuario) && !usuario?.apodo) {
      return hablar(`Hola. Soy ${nombreAsistente()}, tu compañero para conversar. ¿Cómo te llamas?`, {
        locale,
        reprompt: "Dime tu nombre. Por ejemplo: me llamo María.",
        attributes: { ...attributes, esperandoNombre: "si" },
      });
    }
    const next = { ...attributes };
    delete next.esperandoNombre;
    return hablar(saludo(usuario as UsuarioAlexa, now, timeZone), { locale, attributes: next });
  }

  const intent = body.request?.intent?.name || "";

  if (intent === "AMAZON.CancelIntent" && attributes.medPendiente) {
    const next = { ...attributes };
    delete next.medPendiente;
    return hablar("Está bien. No anoté ese medicamento. ¿De qué quieres hablar?", { locale, attributes: next });
  }

  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent" || intent === "AMAZON.NavigateHomeIntent") {
    const primer = usuario && (!sinNombre(usuario) || usuario.apodo) ? comoSeDice(usuario) : "";
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

  const presentacion = clasificarPresentacion(body, attributes, usuario);
  if (presentacion) {
    return aplicarPresentacion(deps, alexaUserId, locale, usuario, attributes, presentacion, now, timeZone);
  }

  if (sinNombre(usuario) && !INTENTS_CON_USUARIO.has(intent)) {
    return charlaSinNombre(body, deps, alexaUserId, locale, usuario, attributes);
  }
  if (!usuario) usuario = await deps.memory.asegurarUsuario(alexaUserId, locale);

  if (intent === "OlvidarConversacionIntent") {
    await deps.memory.clearConversacion(usuario.sessionId);
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
    return hablar(textoMedicamentos(comoSeDice(usuario), await deps.memory.listMedicamentos(usuario.sessionId)), {
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

  const frase = textoDeCharla(textoOido(body));
  if (!frase) {
    const primer = comoSeDice(usuario);
    return hablar(`${primer}, no alcancé a tomar esa frase. Cuéntame otra vez, ¿qué hiciste o cómo te sientes?`, {
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
    console.error(JSON.stringify({ evento: "alexa.conversar", ...resumenErrorLlm(err) }));
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
    const apodo = extraerNombre(slot(body, "apodo") || slot(body, "nombre"));
    if (!apodo) {
      return hablar(`${primer}, ¿cómo quieres que te diga? Un apodo corto, como Queta.`, {
        locale,
        reprompt: "Dime cómo quieres que te llame.",
        attributes,
      });
    }
    await deps.memory.setApodo(usuario.sessionId, apodo);
    return hablar(`Listo. Desde ahora te digo ${apodo}. ¿De qué conversamos?`, { locale, attributes });
  }
  if (intent === "GustosIntent") {
    const tema = limpiarTema(slot(body, "tema"));
    if (!tema) {
      return hablar(`${primer}, ¿de qué te gusta hablar?`, { locale, attributes });
    }
    await deps.memory.agregarTema(usuario.sessionId, tema);
    return hablar(`Anotado, ${primer}. Te gusta ${tema}. ¿Qué me cuentas de eso?`, { locale, attributes });
  }
  if (intent === "EvitarTemaIntent") {
    const tema = limpiarTema(slot(body, "tema"));
    if (!tema) {
      return hablar(`${primer}, ¿qué tema prefieres que no saque?`, { locale, attributes });
    }
    await deps.memory.agregarEvitar(usuario.sessionId, tema);
    return hablar(`Está bien, ${primer}. No voy a sacar el tema de ${tema}. ¿Hablamos de otra cosa?`, { locale, attributes });
  }
  if (intent === "FamiliaIntent") {
    const parentesco = limpiarTema(slot(body, "parentesco"));
    const nombre = limpiarApodo(slot(body, "nombre"));
    if (!parentesco || !nombre) {
      return hablar("Dime el parentesco y el nombre. Por ejemplo: mi nieta se llama Rosa.", { locale, attributes });
    }
    await deps.memory.agregarFamilia(usuario.sessionId, `${parentesco} ${nombre}`);
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
  const saved = await deps.memory.saveMedicamento(usuario.sessionId, medicamento, horario);

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
    await deps.memory.anotarIntercambio(
      usuario.sessionId,
      `Recuérdame tomar ${medicamento} a las ${horaVoz}.`,
      speech,
    );
  } catch (err: any) {
    console.error("[alexa] no se pudo anotar el recordatorio:", err?.message || err);
  }
  return hablar(speech, { locale, attributes: next, cardPermisos: card });
}
