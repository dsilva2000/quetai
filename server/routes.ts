import type { Express } from "express";
import { Server } from "http";
import OpenAI from "openai";
import webpush from "web-push";
import { inicializarFCM } from "./fcm";
import { storage } from "./storage";

const openai = new OpenAI();

// PIN de administrador — en producción usar variable de entorno
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
// Voz en español cálida — Rachel (multilingual) o puedes cambiar por otra
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// ─── Firebase Cloud Messaging (FCM)
inicializarFCM();

// ─── Web Push (VAPID) ─────────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:hola@quetai.tech",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

// Exponer la clave pública al frontend
export const vapidPublicKey = VAPID_PUBLIC;

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
      const stream = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: conv },
        ],
        stream: true,
        max_tokens: 300,
        temperature: 0.8,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta && typeof delta === "string") {
          respuestaCompleta += delta;
          res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
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

  // ── Push: clave pública VAPID ────────────────────────────────────
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  // ── FCM: registrar token del APK ──────────────────────────────────
  app.post("/api/fcm/token", (req, res) => {
    const { sessionId, token } = req.body;
    if (!sessionId || !token) {
      return res.status(400).json({ error: "sessionId y token requeridos" });
    }
    try {
      storage.saveFcmToken(sessionId, token);
      console.log(`[fcm] Token registrado para sesión ${sessionId.slice(0,8)}...`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[fcm] Error guardando token:", err?.message);
      res.status(500).json({ error: "Error guardando token" });
    }
  });

  // ── Push: guardar suscripción ──────────────────────────────────────
  app.post("/api/push/subscribe", (req, res) => {
    const { sessionId, subscription } = req.body;
    if (!sessionId || !subscription?.endpoint) {
      return res.status(400).json({ error: "Datos incompletos" });
    }
    try {
      storage.savePushSuscripcion(
        sessionId,
        subscription.endpoint,
        subscription.keys?.p256dh || "",
        subscription.keys?.auth || ""
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Push subscribe error:", err?.message);
      res.status(500).json({ error: "Error al guardar suscripción" });
    }
  });

  // ── Push: eliminar suscripción ─────────────────────────────────────
  app.post("/api/push/unsubscribe", (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) storage.deletePushSuscripcion(endpoint);
    res.json({ ok: true });
  });

  // ── Recordatorios pendientes (polling desde el frontend) ────────────────
  app.get("/api/session/:sessionId/recordatorios-ahora", (req, res) => {
    const { sessionId } = req.params;
    const usuario = storage.getUsuario(sessionId);
    if (!usuario) return res.json({ recordatorios: [] });

    const meds = storage.getMedicamentos(sessionId);
    if (!meds.length) return res.json({ recordatorios: [] });

    const ahora = new Date();
    const horaActual = ahora.getHours();
    const minActual = ahora.getMinutes();

    // Importar el parser de reminders.ts no es posible aquí,
    // así que replicamos la lógica de parseo básica
    const parsear = (horario: string): { horas: number; minutos: number } | null => {
      const s = horario.toLowerCase().trim()
        .replace(/(\d)\.(\d)/g, "$1:$2")
        .replace(/(\d)\s+(\d{2})(?=\s|$|\s*(am|pm|de))/g, "$1:$2");
      const esPm = /pm|tarde|noche/.test(s);
      const esAm = /am|ma[ñn]ana/.test(s);
      const m1 = s.match(/(\d{1,2}):(\d{2})/);
      if (m1) { let h = parseInt(m1[1]); const min = parseInt(m1[2]); if (esPm && h < 12) h += 12; if (esAm && h === 12) h = 0; return { horas: h % 24, minutos: min }; }
      const m2 = s.match(/(\d{1,2})\s*(am|pm)/);
      if (m2) { let h = parseInt(m2[1]); if (m2[2].startsWith("p") && h < 12) h += 12; if (m2[2].startsWith("a") && h === 12) h = 0; return { horas: h, minutos: 0 }; }
      const m3 = s.match(/(\d{1,2})\s*(de la\s*)?(ma[ñn]ana|tarde|noche)/);
      if (m3) { let h = parseInt(m3[1]); if (m3[3] === "tarde" || m3[3] === "noche") { if (h < 12) h += 12; } return { horas: h, minutos: 0 }; }
      const m4 = s.match(/^(\d{1,2})$/);
      if (m4) return { horas: parseInt(m4[1]) % 24, minutos: 0 };
      return null;
    };

    const primerNombre = usuario.nombre.split(" ")[0];
    const pendientes = meds.filter(m => {
      const p = parsear(m.horario);
      if (!p) return false;
      return p.horas === horaActual && p.minutos === minActual;
    }).map(m => ({
      id: m.id,
      nombre: m.nombre,
      horario: m.horario,
      mensaje: `${primerNombre}, es hora de tomar tu ${m.nombre} 💊`,
    }));

    res.json({ recordatorios: pendientes });
  });

  // ── TTS: texto a voz con ElevenLabs ──────────────────────────────
  app.post("/api/tts", async (req, res) => {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ error: "texto vacío" });
    if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: "TTS no configurado" });

    try {
      const elevenRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: texto.trim(),
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.55, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true },
          }),
        }
      );
      if (!elevenRes.ok) {
        console.error("ElevenLabs error:", await elevenRes.text());
        return res.status(503).json({ error: "Error TTS" });
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      const buf = await elevenRes.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch (err: any) {
      console.error("TTS error:", err?.message);
      res.status(503).json({ error: "Error TTS" });
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
