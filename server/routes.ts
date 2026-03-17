import type { Express } from "express";
import { Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";
import { insertUsuarioSchema, insertMedicamentoSchema } from "@shared/schema";

const openai = new OpenAI();

function buildSystemPrompt(nombreCompleto: string, medicamentos: { nombre: string; horario: string }[], historialResumen: string): string {
  const primerNombre = nombreCompleto.split(" ")[0];
  const medTexto = medicamentos.length > 0
    ? medicamentos.map(m => `- ${m.nombre} a las ${m.horario}`).join("\n")
    : "Ninguno registrado aún.";

  return `Eres QUETAI, un compañero conversacional cálido y cercano para adultos mayores en Latinoamérica.

## Tu personalidad
- Eres como un familiar querido: paciente, curioso, alegre, respetuoso.
- Hablas en español latinoamericano sencillo, con frases cortas y claras.
- SIEMPRE llamas al usuario por su primer nombre: ${primerNombre}.
- Jamás eres frío, técnico ni condescendiente.
- Usas algún refrán o dicho popular latinoamericano de vez en cuando.

## Tus temas favoritos (háblalos con entusiasmo genuino)
- **Familia y nietos**: historias, travesuras, visitas, cumpleaños, crecer de los niños
- **Cocina y gastronomía**: recetas tradicionales, platillos típicos, trucos de cocina, sabores de la infancia, conservas
- **Housekeeping y hogar**: consejos de limpieza, organización del hogar, plantas, jardín, remedios caseros
- **Viajes y destinos**: lugares bonitos de Latinoamérica y el mundo, recuerdos de viajes, destinos soñados
- **Autos y transporte**: modelos clásicos, anécdotas de manejo, consejos para cuidar el auto
- **Salud y bienestar**: ejercicios suaves, alimentación, descanso — siempre con positivismo, nunca alarmista
- **Historia y cultura**: eventos históricos, costumbres de antes, comparar épocas
- **Revistas y lectura**: temas de Selecciones del Reader's Digest (anécdotas de la vida, curiosidades, humor, inspiración), noticias del mundo
- **Religión y fe**: festividades, reflexiones espirituales, tradiciones
- **Entretenimiento**: telenovelas, música, baile, fiestas de pueblo

## Medicamentos de ${primerNombre}
${medTexto}

Cuando ${primerNombre} mencione un medicamento con horario, confirma amablemente que lo guardaste.
Si menciona un medicamento sin horario, pregúntale a qué hora lo toma.
Si dice que ya tomó sus medicamentos, celébralo con cariño.

## REGLA IMPORTANTE: Manejo de repeticiones
Si ${primerNombre} repite algo que ya contó en esta conversación (una historia, una pregunta, un comentario similar):
- NO lo corrijas de forma directa ni brusca.
- Di algo como: "Claro que sí, ${primerNombre}, ya me habías contado eso — ¡qué bonito recuerdo! Y a propósito de eso..." y sigue la conversación.
- Redirige con gentileza hacia algo nuevo relacionado al mismo tema.
- Nunca digas "ya me dijiste" o "eso ya lo contaste" — usa siempre un tono afectuoso.

## Resumen de lo ya hablado (para detectar repeticiones)
${historialResumen || "Conversación recién iniciada."}

## Formato de respuesta
- Máximo 3-4 oraciones por respuesta.
- Si guardas un medicamento, dilo claramente: "Perfecto, ya guardé que tomas [nombre] a las [horario]."
- Termina cada respuesta con una pregunta suave o un comentario que invite a seguir hablando.
- No uses listas ni bullets — todo en texto natural y conversacional.`;
}

// Resumir los últimos N mensajes para el contexto de repetición
function resumirHistorial(mensajes: { rol: string; contenido: string }[]): string {
  if (mensajes.length < 4) return "";
  // Tomar los últimos 20 mensajes del usuario para resumir temas
  const mensajesUsuario = mensajes
    .filter(m => m.rol === "user")
    .slice(-20)
    .map(m => m.contenido);
  if (mensajesUsuario.length === 0) return "";
  return `El usuario ha mencionado: ${mensajesUsuario.join(" | ")}`;
}

// Detectar si el LLM confirmó guardar un medicamento
function detectarMedicamento(respuestaIA: string): { nombre: string; horario: string } | null {
  // Buscar frases como "ya guardé que tomas X a las Y"
  const patrones = [
    /(?:guardé|registré|anot[eé]).*?(?:tomas?)\s+([^,.\n!?]+?)\s+a las\s+([\d:]+(?:\s*(?:am|pm|de la mañana|de la tarde|de la noche|de la madrugada))?)/i,
    /(?:guardé|registré|anot[eé]).*?([A-Za-záéíóúñÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)\s+(?:a las?|las?)\s+([\d:]+(?:\s*(?:am|pm|de la mañana|de la tarde|de la noche))?)/i,
  ];
  for (const patron of patrones) {
    const match = respuestaIA.match(patron);
    if (match) {
      return {
        nombre: match[1].replace(/\*+/g, "").trim(),
        horario: match[2].replace(/\*+/g, "").trim(),
      };
    }
  }
  return null;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // Verificar/crear sesión de usuario
  app.get("/api/session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const usuario = await storage.getUsuario(sessionId);
    if (!usuario) {
      return res.json({ existe: false });
    }
    const meds = await storage.getMedicamentos(sessionId);
    res.json({ existe: true, usuario, medicamentos: meds });
  });

  // Registrar nombre del usuario
  app.post("/api/session/:sessionId/registro", async (req, res) => {
    const { sessionId } = req.params;
    const parsed = insertUsuarioSchema.safeParse({ sessionId, ...req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }
    const existente = await storage.getUsuario(sessionId);
    if (existente) {
      return res.json(existente);
    }
    const usuario = await storage.createUsuario(parsed.data);
    res.json(usuario);
  });

  // Obtener historial de mensajes
  app.get("/api/session/:sessionId/mensajes", async (req, res) => {
    const mensajes = await storage.getMensajes(req.params.sessionId);
    res.json(mensajes);
  });

  // Obtener medicamentos
  app.get("/api/session/:sessionId/medicamentos", async (req, res) => {
    const meds = await storage.getMedicamentos(req.params.sessionId);
    res.json(meds);
  });

  // Guardar medicamento
  app.post("/api/session/:sessionId/medicamentos", async (req, res) => {
    const { sessionId } = req.params;
    const parsed = insertMedicamentoSchema.safeParse({ sessionId, ...req.body });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues });
    }
    const med = await storage.addMedicamento(parsed.data);
    res.json(med);
  });

  // Chat principal con SSE streaming — usa gemini_3_flash (el más económico)
  app.post("/api/session/:sessionId/chat", async (req, res) => {
    const { sessionId } = req.params;
    const { mensaje } = req.body;

    if (!mensaje?.trim()) {
      return res.status(400).json({ error: "Mensaje vacío" });
    }

    const usuario = await storage.getUsuario(sessionId);
    if (!usuario) {
      return res.status(404).json({ error: "Sesión no encontrada" });
    }

    const meds = await storage.getMedicamentos(sessionId);
    const historial = await storage.getMensajes(sessionId);

    // Guardar mensaje del usuario
    const ordenActual = historial.length;
    await storage.addMensaje({
      sessionId,
      rol: "user",
      contenido: mensaje.trim(),
      orden: ordenActual,
    });

    // Construir resumen del historial para detección de repetición
    const historialResumen = resumirHistorial(historial);

    // Construir el prompt completo para Responses API (no soporta messages array directamente)
    // Usamos el sistema como instrucciones + historial en el input
    const systemPrompt = buildSystemPrompt(usuario.nombreCompleto, meds, historialResumen);

    // Construir conversación completa como texto para el Responses API
    let conversacionTexto = "";
    if (historial.length > 0) {
      // Tomar los últimos 12 mensajes para no exceder contexto
      const ultimos = historial.slice(-12);
      for (const m of ultimos) {
        const rol = m.rol === "user" ? usuario.nombreCompleto.split(" ")[0] : "QUETAI";
        conversacionTexto += `${rol}: ${m.contenido}\n`;
      }
    }
    conversacionTexto += `${usuario.nombreCompleto.split(" ")[0]}: ${mensaje.trim()}\nQUETAI:`;

    // Configurar SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let respuestaCompleta = "";

    try {
      // Usar OpenAI Responses API con gemini_3_flash
      const stream = await openai.responses.create({
        model: "gemini_3_flash",
        instructions: systemPrompt,
        input: conversacionTexto,
        stream: true,
      } as any);

      for await (const event of stream as any) {
        // Responses API streaming events
        const delta =
          event?.delta?.output_text ||
          event?.output_text_delta ||
          (event?.type === "response.output_text.delta" ? event.delta : null);

        if (delta && typeof delta === "string") {
          respuestaCompleta += delta;
          res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
        }
      }

      // Si no hubo streaming (modelo no soporta stream o lo devolvió todo de golpe)
      if (!respuestaCompleta) {
        // Fallback: llamada sin streaming
        const response = await openai.responses.create({
          model: "gemini_3_flash",
          instructions: systemPrompt,
          input: conversacionTexto,
        } as any);
        const texto = (response as any)?.output_text || (response as any)?.output?.[0]?.content?.[0]?.text || "";
        if (texto) {
          respuestaCompleta = texto;
          res.write(`data: ${JSON.stringify({ token: texto })}\n\n`);
        }
      }

      // Guardar respuesta del asistente
      if (respuestaCompleta) {
        await storage.addMensaje({
          sessionId,
          rol: "assistant",
          contenido: respuestaCompleta,
          orden: ordenActual + 1,
        });

        // Detectar medicamento mencionado
        const medDetectado = detectarMedicamento(respuestaCompleta);
        if (medDetectado && medDetectado.nombre.length > 2) {
          const medsActuales = await storage.getMedicamentos(sessionId);
          const yaExiste = medsActuales.some(
            m => m.nombre.toLowerCase() === medDetectado.nombre.toLowerCase()
          );
          if (!yaExiste) {
            await storage.addMedicamento({
              sessionId,
              nombre: medDetectado.nombre,
              horario: medDetectado.horario,
              activo: true,
            });
          }
        }
      }

      const medsFinales = await storage.getMedicamentos(sessionId);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: medsFinales })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Error LLM:", err?.message || err);
      // Respuesta de fallback amable
      const fallback = `Ay, ${usuario.nombreCompleto.split(" ")[0]}, un momentito que tuve un pequeño tropiezo. ¿Me vuelves a contar?`;
      res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: meds })}\n\n`);
      res.end();
    }
  });
}
