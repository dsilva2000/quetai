import type { Express } from "express";
import { Server } from "http";
import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI();

// PIN de administrador — en producción usar variable de entorno
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

// ─── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(
  nombre: string,
  medicamentos: { nombre: string; horario: string }[],
  historialResumen: string
): string {
  const primerNombre = nombre.split(" ")[0];
  const medTexto =
    medicamentos.length > 0
      ? medicamentos.map((m) => `- ${m.nombre} a las ${m.horario}`).join("\n")
      : "Ninguno registrado aún.";

  return `Eres QUETAI, un compañero conversacional cálido y cercano para adultos mayores en Latinoamérica.

## Tu personalidad
- Eres como un familiar querido: paciente, curioso, alegre, respetuoso.
- Hablas en español latinoamericano sencillo, con frases cortas y claras.
- SIEMPRE llamas al usuario por su primer nombre: ${primerNombre}.
- Jamás eres frío, técnico ni condescendiente.
- Usas algún refrán o dicho popular latinoamericano de vez en cuando (con moderación).

## Tus temas favoritos (habla sobre ellos con entusiasmo genuino)
- **Familia y nietos**: historias, travesuras, visitas, cumpleaños, el crecimiento de los niños
- **Cocina y gastronomía**: recetas tradicionales, platillos típicos, trucos de cocina, sabores de la infancia
- **Hogar**: consejos de limpieza, organización, plantas, jardín, remedios caseros
- **Viajes y destinos**: lugares de Latinoamérica y el mundo, recuerdos de viajes
- **Autos**: modelos clásicos, anécdotas de manejo, cuidado del auto
- **Salud y bienestar**: ejercicio suave, alimentación — siempre positivo, nunca alarmista
- **Historia y cultura**: costumbres de antes, comparar épocas
- **Selecciones del Reader's Digest**: anécdotas de la vida, curiosidades, humor, inspiración
- **Religión y fe**: festividades, reflexiones espirituales
- **Entretenimiento**: telenovelas, música, fiestas de pueblo

## Medicamentos de ${primerNombre}
${medTexto}

Cuando ${primerNombre} mencione un medicamento con horario, confirma amablemente que lo guardaste con la frase:
"Perfecto, ya guardé que tomas [nombre] a las [horario]."
Si menciona un medicamento sin horario, pregúntale a qué hora lo toma.

## REGLA: Manejo de repeticiones
Si ${primerNombre} repite algo ya contado:
- NO lo corrijas bruscamente.
- Di algo como: "Claro que sí, ${primerNombre}, ya me habías contado eso — ¡qué bonito recuerdo! Y a propósito..."
- Redirige con gentileza. Nunca digas "ya me dijiste".

## Lo que ya se ha hablado (para detectar repeticiones)
${historialResumen || "Conversación recién iniciada."}

## Formato
- Máximo 3-4 oraciones por respuesta.
- Todo en texto natural y conversacional, sin listas ni bullets.
- Termina siempre con una pregunta suave o un comentario que invite a seguir hablando.`;
}

function resumirHistorial(msgs: { rol: string; contenido: string }[]): string {
  if (msgs.length < 4) return "";
  const temas = msgs
    .filter((m) => m.rol === "user")
    .slice(-20)
    .map((m) => m.contenido);
  return `El usuario ha mencionado: ${temas.join(" | ")}`;
}

function detectarMedicamento(texto: string): { nombre: string; horario: string } | null {
  const patrones = [
    /(?:guardé|registré|anotaremos?).*?(?:tomas?)\s+([^,.!\n?]+?)\s+a las\s+([\d:]+(?:\s*(?:am|pm|de la mañana|de la tarde|de la noche))?)/i,
    /ya guardé que tomas\s+([^,.!\n?]+?)\s+a las\s+([\d:]+(?:\s*(?:am|pm|de la mañana|de la tarde|de la noche))?)/i,
  ];
  for (const pat of patrones) {
    const m = texto.match(pat);
    if (m) return { nombre: m[1].replace(/\*+/g, "").trim(), horario: m[2].replace(/\*+/g, "").trim() };
  }
  return null;
}

// ─── Routes ────────────────────────────────────────────────────────────────────
export function registerRoutes(_httpServer: Server, app: Express) {

  // ── Sesión del usuario ───────────────────────────────────────────
  app.get("/api/session/:sessionId", (req, res) => {
    const usuario = storage.getUsuario(req.params.sessionId);
    if (!usuario) return res.json({ existe: false });
    const meds = storage.getMedicamentos(req.params.sessionId);
    res.json({ existe: true, usuario, medicamentos: meds });
  });

  app.post("/api/session/:sessionId/registro", (req, res) => {
    const { sessionId } = req.params;
    const { nombre } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: "Nombre requerido" });
    const existente = storage.getUsuario(sessionId);
    if (existente) return res.json(existente);
    const usuario = storage.createUsuario(sessionId, nombre.trim());
    res.json(usuario);
  });

  // ── Mensajes ─────────────────────────────────────────────────────
  app.get("/api/session/:sessionId/mensajes", (req, res) => {
    res.json(storage.getMensajes(req.params.sessionId));
  });

  // ── Medicamentos ─────────────────────────────────────────────────
  app.get("/api/session/:sessionId/medicamentos", (req, res) => {
    res.json(storage.getMedicamentos(req.params.sessionId));
  });

  app.post("/api/session/:sessionId/medicamentos", (req, res) => {
    const { nombre, horario } = req.body;
    if (!nombre?.trim() || !horario?.trim())
      return res.status(400).json({ error: "nombre y horario requeridos" });
    const med = storage.addMedicamento(req.params.sessionId, nombre.trim(), horario.trim());
    res.json(med);
  });

  app.delete("/api/session/:sessionId/medicamentos/:id", (req, res) => {
    storage.deleteMedicamento(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Chat con SSE streaming ────────────────────────────────────────
  app.post("/api/session/:sessionId/chat", async (req, res) => {
    const { sessionId } = req.params;
    const { mensaje } = req.body;

    if (!mensaje?.trim()) return res.status(400).json({ error: "Mensaje vacío" });

    const usuario = storage.getUsuario(sessionId);
    if (!usuario) return res.status(404).json({ error: "Sesión no encontrada" });

    const meds = storage.getMedicamentos(sessionId);
    const historial = storage.getMensajes(sessionId);
    const orden = historial.length;

    storage.addMensaje(sessionId, "user", mensaje.trim(), orden);

    const systemPrompt = buildSystemPrompt(usuario.nombre, meds, resumirHistorial(historial));

    // Construir contexto conversacional (últimos 12 turnos)
    let conv = "";
    const ultimos = historial.slice(-12);
    for (const m of ultimos) {
      conv += `${m.rol === "user" ? usuario.nombre.split(" ")[0] : "QUETAI"}: ${m.contenido}\n`;
    }
    conv += `${usuario.nombre.split(" ")[0]}: ${mensaje.trim()}\nQUETAI:`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let respuestaCompleta = "";

    try {
      const stream = await openai.responses.create({
        model: "gemini_3_flash",
        instructions: systemPrompt,
        input: conv,
        stream: true,
      } as any);

      for await (const event of stream as any) {
        const delta =
          event?.delta?.output_text ||
          event?.output_text_delta ||
          (event?.type === "response.output_text.delta" ? event.delta : null);
        if (delta && typeof delta === "string") {
          respuestaCompleta += delta;
          res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
        }
      }

      if (!respuestaCompleta) {
        const r = await openai.responses.create({
          model: "gemini_3_flash",
          instructions: systemPrompt,
          input: conv,
        } as any);
        const texto = (r as any)?.output_text || "";
        if (texto) {
          respuestaCompleta = texto;
          res.write(`data: ${JSON.stringify({ token: texto })}\n\n`);
        }
      }

      if (respuestaCompleta) {
        storage.addMensaje(sessionId, "assistant", respuestaCompleta, orden + 1);
        const med = detectarMedicamento(respuestaCompleta);
        if (med && med.nombre.length > 2) {
          const ya = meds.some((m) => m.nombre.toLowerCase() === med.nombre.toLowerCase());
          if (!ya) storage.addMedicamento(sessionId, med.nombre, med.horario);
        }
      }

      const medsFinales = storage.getMedicamentos(sessionId);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: medsFinales })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Error LLM:", err?.message || err);
      const fb = `Ay, ${usuario.nombre.split(" ")[0]}, tuve un pequeño tropiezo. ¿Me vuelves a contar?`;
      res.write(`data: ${JSON.stringify({ token: fb })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: meds })}\n\n`);
      res.end();
    }
  });

  // ── Resetear conversación ─────────────────────────────────────────
  app.delete("/api/session/:sessionId/mensajes", (req, res) => {
    storage.clearMensajes(req.params.sessionId);
    res.json({ ok: true });
  });

  // ── Admin: verificar PIN ──────────────────────────────────────────
  app.post("/api/admin/login", (req, res) => {
    const { pin } = req.body;
    if (pin === ADMIN_PIN) {
      res.json({ ok: true, token: Buffer.from(`admin:${ADMIN_PIN}`).toString("base64") });
    } else {
      res.status(401).json({ error: "PIN incorrecto" });
    }
  });

  // Middleware para proteger rutas admin
  function adminAuth(req: any, res: any, next: any) {
    const auth = req.headers["x-admin-token"];
    const expected = Buffer.from(`admin:${ADMIN_PIN}`).toString("base64");
    if (auth === expected) return next();
    res.status(401).json({ error: "No autorizado" });
  }

  // ── Admin: estadísticas generales ────────────────────────────────
  app.get("/api/admin/stats", adminAuth, (_req, res) => {
    res.json(storage.getStats());
  });

  // ── Admin: lista de todos los usuarios ───────────────────────────
  app.get("/api/admin/usuarios", adminAuth, (_req, res) => {
    const usuarios = storage.getAllUsuarios();
    const resultado = usuarios.map((u) => {
      const meds = storage.getMedicamentos(u.sessionId);
      const msgCount = storage.getMensajesCount(u.sessionId);
      return { ...u, medicamentos: meds, mensajesCount: msgCount };
    });
    res.json(resultado);
  });

  // ── Admin: ver conversación de un usuario ─────────────────────────
  app.get("/api/admin/usuarios/:sessionId/mensajes", adminAuth, (req, res) => {
    const msgs = storage.getMensajes(req.params.sessionId, 500);
    res.json(msgs);
  });

  // ── Admin: borrar usuario completo ────────────────────────────────
  app.delete("/api/admin/usuarios/:sessionId", adminAuth, (req, res) => {
    storage.deleteUsuario(req.params.sessionId);
    res.json({ ok: true });
  });

  // ── Admin: borrar solo conversación ──────────────────────────────
  app.delete("/api/admin/usuarios/:sessionId/mensajes", adminAuth, (req, res) => {
    storage.clearMensajes(req.params.sessionId);
    res.json({ ok: true });
  });
}
