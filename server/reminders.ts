// QUETAI — Cron de recordatorios de medicamentos v4.1
// Prioriza FCM (APK nativo) sobre VAPID (web push)

import webpush from "web-push";
import { enviarFCM } from "./fcm";
import { storage } from "./storage";

function getSaludo(hora: number): string {
  if (hora < 12) return "Buenos días";
  if (hora < 18) return "Buenas tardes";
  return "Buenas noches";
}

function getMensaje(nombreUsuario: string, nombreMed: string, horario: string): { title: string; body: string } {
  const primer = nombreUsuario.split(" ")[0];
  const hora = new Date().getHours();
  const saludo = getSaludo(hora);
  const variantes = [
    { title: `💊 Hora de tu medicamento, ${primer}`, body: `${saludo} ${primer} — es momento de tomar tu ${nombreMed}. ¡No te olvides!` },
    { title: `QUETAI te recuerda 💊`, body: `${primer}, son las ${horario} y es hora de tu ${nombreMed}. Cuídate mucho.` },
    { title: `💊 ${nombreMed} — ${horario}`, body: `${saludo} ${primer}, recuerda tomar tu ${nombreMed} ahora.` },
  ];
  return variantes[Math.floor(Math.random() * variantes.length)];
}

function parsearHorario(horario: string): { horas: number; minutos: number } | null {
  const s = horario.toLowerCase().trim()
    .replace(/(\d)\.(\d)/g, "$1:$2")
    .replace(/(\d)\s+(\d{2})(?=\s|$|\s*(am|pm|de))/g, "$1:$2");

  const esPm = /pm|p\.m|tarde|noche/.test(s);
  const esAm = /am|a\.m|ma[ñn]ana/.test(s);

  const m1 = s.match(/(\d{1,2}):(\d{2})/);
  if (m1) { let h = parseInt(m1[1]); const min = parseInt(m1[2]); if (esPm && h < 12) h += 12; if (esAm && h === 12) h = 0; return { horas: h % 24, minutos: min }; }

  const m2 = s.match(/(\d{1,2})\s*(am|pm|a\.m|p\.m)/);
  if (m2) { let h = parseInt(m2[1]); const p = m2[2]; if (p.startsWith("p") && h < 12) h += 12; if (p.startsWith("a") && h === 12) h = 0; return { horas: h, minutos: 0 }; }

  const m3 = s.match(/(\d{1,2})\s*(?:de la\s*)?(ma[ñn]ana|tarde|noche)/);
  if (m3) { let h = parseInt(m3[1]); if (m3[2] === "tarde" || m3[2] === "noche") { if (h < 12) h += 12; } return { horas: h, minutos: 0 }; }

  const m4 = s.match(/^(\d{1,2})$/);
  if (m4) return { horas: parseInt(m4[1]) % 24, minutos: 0 };

  return null;
}

// Enviar recordatorio por WhatsApp via waboxapp
async function enviarWhatsApp(telefono: string, mensaje: string, uid: string): Promise<boolean> {
  const token = process.env.WABOXAPP_TOKEN;
  if (!token || !uid) return false;
  try {
    const params = new URLSearchParams({
      token,
      uid,
      to: telefono,
      text: mensaje,
      custom_uid: `quetai-${Date.now()}`,
    });
    const r = await fetch(`https://www.waboxapp.com/api/send/chat?${params}`);
    const data = await r.json() as any;
    if (data?.success) {
      console.log(`[whatsapp] ✓ Mensaje enviado a ${telefono.slice(0,6)}...`);
      return true;
    } else {
      console.error("[whatsapp] Error:", JSON.stringify(data));
      return false;
    }
  } catch (err: any) {
    console.error("[whatsapp] Error enviando:", err?.message);
    return false;
  }
}

async function enviarRecordatorios() {
  try {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    const minActual = ahora.getMinutes();
    const fechaHoraKey = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')} ${String(horaActual).padStart(2,'0')}:${String(minActual).padStart(2,'0')}`;

    // ── 1. FCM (APK nativo — funciona con app cerrada) ────────────────────
    const registrosFCM = storage.getMedicamentosConFCM();
    console.log(`[cron] Verificando ${registrosFCM.length} med+FCM tokens a las ${horaActual}:${String(minActual).padStart(2,'0')}`);

    for (const r of registrosFCM) {
      const parsed = parsearHorario(r.horario);
      if (!parsed) continue;
      if (parsed.horas !== horaActual || parsed.minutos !== minActual) continue;
      if (storage.yaSeEnvioRecordatorio(r.sessionId, r.medId, fechaHoraKey)) continue;

      const { title, body } = getMensaje(r.usuarioNombre, r.nombre, r.horario);
      console.log(`[fcm] Intentando enviar a ${r.usuarioNombre} → ${r.nombre} @ ${r.horario}`);

      const ok = await enviarFCM(r.token, title, body, {
        sessionId: r.sessionId,
        medId: String(r.medId),
        tipo: "recordatorio",
      });

      if (ok) {
        storage.registrarRecordatorioEnviado(r.sessionId, r.medId);
        console.log(`[fcm] ✓ Recordatorio enviado: ${r.usuarioNombre} → ${r.nombre} @ ${r.horario}`);
      } else {
        console.log(`[fcm] Token inválido para ${r.usuarioNombre}, eliminando`);
        storage.deleteFcmToken(r.token);
      }
    }

    // ── 2. WhatsApp (fallback universal — funciona en cualquier celular) ────
    const WABOXAPP_UID = process.env.WABOXAPP_UID || "";
    if (WABOXAPP_UID) {
      const registrosWA = storage.getMedicamentosConTelefono();
      for (const r of registrosWA) {
        const parsed = parsearHorario(r.horario);
        if (!parsed) continue;
        if (parsed.horas !== horaActual || parsed.minutos !== minActual) continue;
        if (storage.yaSeEnvioRecordatorio(r.sessionId, r.medId, fechaHoraKey)) continue;
        const primer = r.usuarioNombre.split(" ")[0];
        const msg = `💊 Hola ${primer}, es hora de tomar tu ${r.nombre} (${r.horario}). - QUETAI`;
        const ok = await enviarWhatsApp(r.telefono, msg, WABOXAPP_UID);
        if (ok) storage.registrarRecordatorioEnviado(r.sessionId, r.medId);
      }
    }

    // ── 3. VAPID (webapp PWA instalada) ───────────────────────────────────
    const registrosVAPID = storage.getMedicamentosParaRecordatorio();

    for (const r of registrosVAPID) {
      const parsed = parsearHorario(r.horario);
      if (!parsed) continue;
      if (parsed.horas !== horaActual || parsed.minutos !== minActual) continue;
      if (storage.yaSeEnvioRecordatorio(r.sessionId, r.medId, fechaHoraKey)) continue;

      const { title, body } = getMensaje(r.usuarioNombre, r.nombre, r.horario);
      const payload = JSON.stringify({ title, body, tag: `med-${r.medId}`, sessionId: r.sessionId });
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };

      try {
        await webpush.sendNotification(subscription, payload);
        storage.registrarRecordatorioEnviado(r.sessionId, r.medId);
        console.log(`[push] ✓ Recordatorio enviado: ${r.usuarioNombre} → ${r.nombre} @ ${r.horario}`);
      } catch (err: any) {
        if (err?.statusCode === 410) {
          storage.deletePushSuscripcion(r.endpoint);
        } else {
          console.error(`[push] Error enviando a ${r.usuarioNombre}:`, err?.message);
        }
      }
    }

  } catch (err: any) {
    console.error("[cron] Error en cron de recordatorios:", err?.message);
  }
}

// Auto-ping para mantener Render despierto (cada 14 minutos)
function iniciarPingRender() {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) return; // Solo en Render
  const ping = () => {
    fetch(`${url}/api/health`)
      .then(() => console.log("[ping] Keep-alive OK"))
      .catch(() => {});
  };
  setInterval(ping, 14 * 60 * 1000); // 14 minutos
  console.log("[ping] Auto-ping Render iniciado");
}

export function iniciarCronRecordatorios() {
  console.log("[cron] Cron de recordatorios iniciado");
  iniciarPingRender();

  const tick = () => {
    enviarRecordatorios();
    const ahora = new Date();
    const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds() + 100;
    setTimeout(tick, msHastaProximoMinuto);
  };

  const ahora = new Date();
  const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds() + 100;
  setTimeout(tick, msHastaProximoMinuto);
}
