import type { Express } from "express";
import { Server } from "http";
import webpush from "web-push";
import { conCache } from "./cache-peticion";
import { inicializarFCM } from "./fcm";
import { storage } from "./storage";
import { registerAlexaRoutes } from "./alexa/route";
import { healthPayload } from "./health";
import { registerLegalRoutes } from "./legal";
import { programarActualizacionMemoria, promptDeSesion, streamChat } from "./conversation";
import { logLlm, modeloFallback, modeloPrincipal, completarTexto } from "./llm";
import {
  armarContexto,
  detectarMedicamento,
  tropiezoDe,
} from "./prompt";

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

// ─── Routes ────────────────────────────────────────────────────────────────────
export function registerRoutes(_httpServer: Server, app: Express) {
  app.use((_req, _res, next) => {
    conCache(() => next());
  });
  registerLegalRoutes(app);
  registerAlexaRoutes(app);

  // ── Sesión del usuario ───────────────────────────────────────────
  app.get("/api/session/:sessionId", async (req, res) => {
    const [usuario, meds] = await Promise.all([
      storage.getUsuario(req.params.sessionId),
      storage.getMedicamentos(req.params.sessionId),
    ]);
    if (!usuario) return res.json({ existe: false });
    res.json({ existe: true, usuario, medicamentos: meds });
  });

  // ── Guardar teléfono del usuario (WhatsApp) ──────────────────────────
  app.post("/api/session/:sessionId/telefono", async (req, res) => {
    const { telefono } = req.body;
    if (!telefono?.trim()) return res.status(400).json({ error: "teléfono requerido" });
    // Limpiar: solo números y +
    const tel = telefono.trim().replace(/[^+\d]/g, "");
    await storage.savePhone(req.params.sessionId, tel);
    res.json({ ok: true });
  });

  app.post("/api/session/:sessionId/registro", async (req, res) => {
    const { sessionId } = req.params;
    const { nombre } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: "Nombre requerido" });
    const existente = await storage.getUsuario(sessionId);
    if (existente) return res.json(existente);
    const usuario = await storage.createUsuario(sessionId, nombre.trim());
    res.json(usuario);
  });

  // ── Mensajes ─────────────────────────────────────────────────────
  app.get("/api/session/:sessionId/mensajes", async (req, res) => {
    res.json(await storage.getMensajes(req.params.sessionId));
  });

  // ── Medicamentos ─────────────────────────────────────────────────
  app.get("/api/session/:sessionId/medicamentos", async (req, res) => {
    res.json(await storage.getMedicamentos(req.params.sessionId));
  });

  app.post("/api/session/:sessionId/medicamentos", async (req, res) => {
    const { nombre, horario } = req.body;
    if (!nombre?.trim() || !horario?.trim())
      return res.status(400).json({ error: "nombre y horario requeridos" });
    const med = await storage.addMedicamento(req.params.sessionId, nombre.trim(), horario.trim());
    res.json(med);
  });

  app.delete("/api/session/:sessionId/medicamentos/:id", async (req, res) => {
    await storage.deleteMedicamento(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── Chat con SSE streaming ────────────────────────────────────────
  app.post("/api/session/:sessionId/chat", async (req, res) => {
    const { sessionId } = req.params;
    const { mensaje } = req.body;

    if (!mensaje?.trim()) return res.status(400).json({ error: "Mensaje vacío" });

    const [usuario, meds, historial] = await Promise.all([
      storage.getUsuario(sessionId),
      storage.getMedicamentos(sessionId),
      storage.getMensajes(sessionId),
      storage.getPerfil(sessionId),
      storage.getMemoria(sessionId),
    ]);
    if (!usuario) return res.status(404).json({ error: "Sesión no encontrada" });

    const orden = historial.length;

    await storage.addMensaje(sessionId, "user", mensaje.trim(), orden);

    const systemPrompt = await promptDeSesion(sessionId, usuario.nombre, meds, historial, "web");
    const conv = armarContexto(usuario.nombre, historial, mensaje.trim());

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let respuestaCompleta = "";
    const inicioChat = Date.now();

    try {
      const stream = await streamChat(systemPrompt, conv);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta && typeof delta === "string") {
          respuestaCompleta += delta;
          res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
        }
      }

      if (respuestaCompleta) {
        await storage.addMensaje(sessionId, "assistant", respuestaCompleta, orden + 1);
        programarActualizacionMemoria(sessionId);
        const med = detectarMedicamento(respuestaCompleta);
        if (med && med.nombre.length > 2) {
          const ya = meds.some((m) => m.nombre.toLowerCase() === med.nombre.toLowerCase());
          if (!ya) await storage.addMedicamento(sessionId, med.nombre, med.horario);
        }
      }

      const medsFinales = await storage.getMedicamentos(sessionId);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: medsFinales })}\n\n`);
      res.end();
    } catch (err: any) {
      logLlm("chat.stream.error", modeloPrincipal(), inicioChat, err);
      let fb = "";
      try {
        fb = await completarTexto({
          system: systemPrompt,
          user: conv,
          maxTokens: 300,
          model: modeloFallback(),
          timeoutMs: 8000,
        });
      } catch (err2: any) {
        logLlm("chat.fallback.error", modeloFallback(), Date.now(), err2);
      }
      if (!fb.trim()) fb = tropiezoDe(usuario.nombre, (await storage.getPerfil(sessionId)).apodo);
      res.write(`data: ${JSON.stringify({ token: fb })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, medicamentos: meds })}\n\n`);
      res.end();
    }
  });

  // ── Health check (Render keep-alive) ─────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json(healthPayload());
  });

  // ── Push: clave pública VAPID ────────────────────────────────────
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  // ── FCM: registrar token del APK ──────────────────────────────────
  app.post("/api/fcm/token", async (req, res) => {
    const { sessionId, token } = req.body;
    if (!sessionId || !token) {
      return res.status(400).json({ error: "sessionId y token requeridos" });
    }
    try {
      await storage.saveFcmToken(sessionId, token);
      console.log(`[fcm] Token registrado para sesión ${sessionId.slice(0,8)}...`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[fcm] Error guardando token:", err?.message);
      res.status(500).json({ error: "Error guardando token" });
    }
  });

  // ── Push: guardar suscripción ──────────────────────────────────────
  app.post("/api/push/subscribe", async (req, res) => {
    const { sessionId, subscription } = req.body;
    if (!sessionId || !subscription?.endpoint) {
      return res.status(400).json({ error: "Datos incompletos" });
    }
    try {
      await storage.savePushSuscripcion(
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
  app.post("/api/push/unsubscribe", async (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) await storage.deletePushSuscripcion(endpoint);
    res.json({ ok: true });
  });

  // ── Recordatorios pendientes (polling desde el frontend) ────────────────
  app.get("/api/session/:sessionId/recordatorios-ahora", async (req, res) => {
    const { sessionId } = req.params;
    const usuario = await storage.getUsuario(sessionId);
    if (!usuario) return res.json({ recordatorios: [] });

    const meds = await storage.getMedicamentos(sessionId);
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

  // ── TTS: texto a voz con Gemini 2.5 Flash (natural, femenino, cálido) ──────
  app.post("/api/tts", async (req, res) => {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ error: "texto vacío" });

    const GEMINI_KEY = process.env.OPENAI_API_KEY?.startsWith("AIza")
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY || "";

    if (!GEMINI_KEY) return res.status(503).json({ error: "TTS no configurado" });

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: texto.trim() }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Aoede" } // Voz femenina, cálida
                }
              }
            }
          }),
        }
      );

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        console.error("Gemini TTS error:", err.slice(0, 100));
        return res.status(503).json({ error: "Error TTS" });
      }

      const data = await geminiRes.json() as any;
      const audioBase64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) return res.status(503).json({ error: "Sin audio" });

      // Gemini devuelve PCM 24kHz — lo convertimos a WAV para el browser
      const pcm = Buffer.from(audioBase64, "base64");

      // Crear header WAV (PCM 16-bit, 24kHz, mono)
      const sampleRate = 24000;
      const channels = 1;
      const bitsPerSample = 16;
      const dataSize = pcm.length;
      const headerSize = 44;
      const wav = Buffer.alloc(headerSize + dataSize);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(36 + dataSize, 4);
      wav.write("WAVE", 8);
      wav.write("fmt ", 12);
      wav.writeUInt32LE(16, 16); // PCM chunk size
      wav.writeUInt16LE(1, 20);  // PCM format
      wav.writeUInt16LE(channels, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
      wav.writeUInt16LE(channels * bitsPerSample / 8, 32);
      wav.writeUInt16LE(bitsPerSample, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(dataSize, 40);
      pcm.copy(wav, 44);

      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Cache-Control", "no-cache");
      res.send(wav);
    } catch (err: any) {
      console.error("TTS error:", err?.message);
      res.status(503).json({ error: "Error TTS" });
    }
  });

  // ── Resetear conversación ─────────────────────────────────────────
  app.delete("/api/session/:sessionId/mensajes", async (req, res) => {
    await storage.clearMensajes(req.params.sessionId);
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

  // ── Admin: ver tokens FCM registrados ────────────────────────────────
  app.get("/api/admin/fcm-tokens", adminAuth, async (_req, res) => {
    const usuarios = await storage.getAllUsuarios();
    const resultado = await Promise.all(usuarios.map(async (u) => {
      const [tokens, meds] = await Promise.all([
        storage.getFcmTokensBySession(u.sessionId),
        storage.getMedicamentos(u.sessionId),
      ]);
      return { nombre: u.nombre, sessionId: u.sessionId, fcmTokens: tokens.length, medicamentos: meds.length };
    }));
    res.json(resultado.filter(u => u.fcmTokens > 0 || u.medicamentos > 0));
  });

  // ── Admin: enviar notificación de prueba FCM ──────────────────────
  app.post("/api/admin/test-fcm", adminAuth, async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId requerido" });
    const tokens = await storage.getFcmTokensBySession(sessionId);
    if (!tokens.length) return res.json({ ok: false, error: "No hay tokens FCM para esta sesión" });
    const usuario = await storage.getUsuario(sessionId);
    const nombre = usuario?.nombre.split(" ")[0] || "Amigo";
    let enviados = 0;
    for (const token of tokens) {
      const { enviarFCM: fcm } = await import("./fcm");
      const ok = await fcm(token, `💊 Prueba de QUETAI`, `Hola ${nombre}, si ves esto ¡FCM funciona! 🎉`);
      if (ok) enviados++;
    }
    res.json({ ok: enviados > 0, enviados, tokens: tokens.length });
  });

  // ── Admin: estadísticas generales ────────────────────────────────
  app.get("/api/admin/stats", adminAuth, async (_req, res) => {
    res.json(await storage.getStats());
  });

  // ── Admin: lista de todos los usuarios ───────────────────────────
  app.get("/api/admin/usuarios", adminAuth, async (_req, res) => {
    const usuarios = await storage.getAllUsuarios();
    const resultado = await Promise.all(usuarios.map(async (u) => {
      const [meds, msgCount, perfil] = await Promise.all([
        storage.getMedicamentos(u.sessionId),
        storage.getMensajesCount(u.sessionId),
        storage.getPerfil(u.sessionId),
      ]);
      return { ...u, medicamentos: meds, mensajesCount: msgCount, perfil };
    }));
    res.json(resultado);
  });

  // ── Admin: ver conversación de un usuario ─────────────────────────
  app.get("/api/admin/usuarios/:sessionId/mensajes", adminAuth, async (req, res) => {
    const msgs = await storage.getMensajes(req.params.sessionId, 500);
    res.json(msgs);
  });

  // ── Admin: borrar usuario completo ────────────────────────────────
  app.delete("/api/admin/usuarios/:sessionId", adminAuth, async (req, res) => {
    await storage.deleteUsuario(req.params.sessionId);
    res.json({ ok: true });
  });

  // ── Admin: borrar solo conversación ──────────────────────────────
  app.delete("/api/admin/usuarios/:sessionId/mensajes", adminAuth, async (req, res) => {
    await storage.clearMensajes(req.params.sessionId);
    res.json({ ok: true });
  });

  app.put("/api/admin/usuarios/:sessionId/perfil", adminAuth, async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!await storage.getUsuario(sessionId)) return res.status(404).json({ error: "Sesión no encontrada" });
    const body = req.body || {};
    const perfil = await storage.savePerfil(sessionId, {
      apodo: String(body.apodo ?? ""),
      temas: String(body.temas ?? ""),
      evitar: String(body.evitar ?? ""),
      familia: String(body.familia ?? ""),
      notas: String(body.notas ?? ""),
    }, "replace");
    res.json(perfil);
  });
}
