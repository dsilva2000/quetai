import OpenAI from "openai";
import { storage } from "./storage";
import {
  acortarOraciones,
  armarContexto,
  buildSystemPrompt,
  detectarMedicamento,
  mensajeTropiezo,
  resumirHistorial,
  type CanalConversacion,
} from "./prompt";

const openai = new OpenAI();
const MODELO = "llama-3.3-70b-versatile";

export function streamChat(systemPrompt: string, conv: string) {
  return openai.chat.completions.create({
    model: MODELO,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: conv },
    ],
    stream: true,
    max_tokens: 300,
    temperature: 0.8,
  });
}

async function completeChat(systemPrompt: string, conv: string, maxTokens: number): Promise<string> {
  const res = await openai.chat.completions.create({
    model: MODELO,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: conv },
    ],
    stream: false,
    max_tokens: maxTokens,
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content?.trim() || "";
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

  const systemPrompt = buildSystemPrompt(usuario.nombre, meds, resumirHistorial(historial), canal);
  const conv = armarContexto(usuario.nombre, historial, texto);

  let respuesta = "";
  try {
    respuesta = await completeChat(systemPrompt, conv, canal === "alexa" ? 160 : 300);
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

  return respuesta;
}
