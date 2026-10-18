import { nombreAsistente } from "./brand";
import { storage } from "./storage";
import { completarTexto, crearStream, modeloFallback, timeoutAlexaMs } from "./llm";
import { elegirMensajesParaMemoria, textoParaResumir } from "./memoria";
import { formatearTitulares, obtenerTitulares } from "./noticias";
import {
  acortarOraciones,
  armarContexto,
  buildSystemPrompt,
  detectarMedicamento,
  mensajeTropiezo,
  resumirHistorial,
  type CanalConversacion,
} from "./prompt";

export function streamChat(systemPrompt: string, conv: string) {
  return crearStream(systemPrompt, conv);
}

export async function promptDeSesion(
  sessionId: string,
  nombre: string,
  meds: { nombre: string; horario: string }[],
  historial: { rol: string; contenido: string }[],
  canal: CanalConversacion,
): Promise<string> {
  const perfil = storage.getPerfil(sessionId);
  const memoria = storage.getMemoria(sessionId);
  let noticias = "";
  try {
    const items = await obtenerTitulares(["farandula", "politica", "actualidad"], {
      timeoutMs: canal === "alexa" ? 800 : 2000,
    });
    noticias = formatearTitulares(items.slice(0, 6));
  } catch (err: any) {
    console.error("[noticias] contexto:", err?.message || err);
  }
  return buildSystemPrompt(nombre, meds, resumirHistorial(historial), canal, {
    apodo: perfil.apodo,
    temas: perfil.temas,
    evitar: perfil.evitar,
    familia: perfil.familia,
    notas: perfil.notas,
    memoria: memoria?.resumen || "",
    noticias,
    asistente: nombreAsistente(),
  });
}

/** No bloquea la respuesta. El resumen usa el modelo rápido. */
export function programarActualizacionMemoria(sessionId: string): void {
  void actualizarMemoria(sessionId).catch((err: any) => {
    console.error("[memoria]", err?.message || err);
  });
}

async function actualizarMemoria(sessionId: string): Promise<void> {
  const previa = storage.getMemoria(sessionId);
  const mensajes = storage.getMensajes(sessionId);
  const lote = elegirMensajesParaMemoria(mensajes, previa?.hastaOrden ?? 0);
  if (!lote) return;
  const resumen = await completarTexto({
    system:
      "Actualiza un resumen de unas 80 palabras, en español del Perú. Incluye solo lo que la persona contó: familia, gustos, rutinas y hechos ya dichos. No inventes. No des consejos médicos. No nombres partidos ni candidatos salvo que la persona los haya mencionado.",
    user: textoParaResumir(previa?.resumen || "", lote.paraResumir),
    maxTokens: 180,
    temperature: 0.2,
    timeoutMs: 8000,
    model: modeloFallback(),
  });
  if (!resumen.trim()) return;
  storage.saveMemoria(sessionId, resumen.trim(), lote.nuevoHasta);
}

/**
 * Turno de conversación no streaming. Lo usa Alexa.
 * Guarda el mensaje del usuario y la respuesta en la misma tabla `mensajes`.
 */
export async function conversar(
  sessionId: string,
  mensaje: string,
  canal: CanalConversacion = "alexa",
): Promise<string> {
  const usuario = storage.getUsuario(sessionId);
  if (!usuario) throw new Error("Sesión no encontrada");

  const meds = storage.getMedicamentos(sessionId);
  const historial = storage.getMensajes(sessionId);
  const orden = historial.length;
  const texto = mensaje.trim();
  storage.addMensaje(sessionId, "user", texto, orden);

  const inicio = Date.now();
  const systemPrompt = await promptDeSesion(sessionId, usuario.nombre, meds, historial, canal);
  const conv = armarContexto(usuario.nombre, historial, texto);

  let respuesta = "";
  try {
    const presupuesto = canal === "alexa" ? timeoutAlexaMs() : undefined;
    const restante = presupuesto ? Math.max(1200, presupuesto - (Date.now() - inicio)) : undefined;
    respuesta = await completarTexto({
      system: systemPrompt,
      user: conv,
      maxTokens: canal === "alexa" ? 160 : 300,
      timeoutMs: restante,
    });
  } catch (err: any) {
    console.error("Error LLM:", err?.message || err);
    respuesta = mensajeTropiezo(usuario.nombre);
  }

  if (!respuesta.trim()) respuesta = mensajeTropiezo(usuario.nombre);
  if (canal === "alexa") respuesta = acortarOraciones(respuesta, 3);

  storage.addMensaje(sessionId, "assistant", respuesta, orden + 1);

  const med = detectarMedicamento(respuesta);
  if (med && med.nombre.length > 2) {
    const ya = meds.some((m) => m.nombre.toLowerCase() === med.nombre.toLowerCase());
    if (!ya) storage.addMedicamento(sessionId, med.nombre, med.horario);
  }

  programarActualizacionMemoria(sessionId);
  return respuesta;
}
