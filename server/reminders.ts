// QUETAI — Cron de recordatorios de medicamentos
// Se ejecuta cada minuto y envía notificaciones push a los usuarios
// que tengan medicamentos programados para esta hora

import webpush from "web-push";
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
    {
      title: `💊 Hora de tu medicamento, ${primer}`,
      body: `${saludo} ${primer} — es momento de tomar tu ${nombreMed}. ¡No te olvides!`,
    },
    {
      title: `QUETAI te recuerda 💊`,
      body: `${primer}, son las ${horario} y es hora de tu ${nombreMed}. Cuídate mucho.`,
    },
    {
      title: `💊 ${nombreMed} — ${horario}`,
      body: `${saludo} ${primer}, recuerda tomar tu ${nombreMed} ahora.`,
    },
  ];

  return variantes[Math.floor(Math.random() * variantes.length)];
}

// Parsear horario "HH:MM", "8", "8am", "8 de la mañana", etc.
function parsearHorario(horario: string): { horas: number; minutos: number } | null {
  const s = horario.toLowerCase().trim();

  // Formato HH:MM
  const matchHHMM = s.match(/^(\d{1,2}):(\d{2})/);
  if (matchHHMM) {
    return { horas: parseInt(matchHHMM[1]), minutos: parseInt(matchHHMM[2]) };
  }

  // Formato "8am", "8pm", "8 am"
  const matchAmPm = s.match(/^(\d{1,2})\s*(am|pm)/);
  if (matchAmPm) {
    let h = parseInt(matchAmPm[1]);
    if (matchAmPm[2] === "pm" && h < 12) h += 12;
    if (matchAmPm[2] === "am" && h === 12) h = 0;
    return { horas: h, minutos: 0 };
  }

  // Solo número "8" → asumir en punto
  const matchNum = s.match(/^(\d{1,2})$/);
  if (matchNum) {
    return { horas: parseInt(matchNum[1]), minutos: 0 };
  }

  // "de la mañana" → AM, "de la tarde/noche" → PM
  const matchNatural = s.match(/(\d{1,2})(?::(\d{2}))?\s*(de la ma[ñn]ana|de la tarde|de la noche|mañana|tarde|noche)/);
  if (matchNatural) {
    let h = parseInt(matchNatural[1]);
    const min = matchNatural[2] ? parseInt(matchNatural[2]) : 0;
    const periodo = matchNatural[3];
    if (periodo.includes("tarde") && h < 12) h += 12;
    if (periodo.includes("noche") && h < 12) h += 12;
    return { horas: h, minutos: min };
  }

  return null;
}

async function enviarRecordatorios() {
  try {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    const minActual = ahora.getMinutes();
    // Formato para comparar con la DB: "YYYY-MM-DD HH:MM"
    const fechaHoraKey = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')} ${String(horaActual).padStart(2,'0')}:${String(minActual).padStart(2,'0')}`;

    const registros = storage.getMedicamentosParaRecordatorio();

    for (const r of registros) {
      const parsed = parsearHorario(r.horario);
      if (!parsed) continue;

      // Verificar si la hora coincide (±0 minutos exactos)
      if (parsed.horas !== horaActual || parsed.minutos !== minActual) continue;

      // Verificar que no se haya enviado ya este minuto
      if (storage.yaSeEnvioRecordatorio(r.sessionId, r.medId, fechaHoraKey)) continue;

      const { title, body } = getMensaje(r.usuarioNombre, r.nombre, r.horario);
      const payload = JSON.stringify({
        title,
        body,
        tag: `med-${r.medId}`,
        sessionId: r.sessionId,
        url: `/#/?sid=${r.sessionId}`,
      });

      const subscription = {
        endpoint: r.endpoint,
        keys: { p256dh: r.p256dh, auth: r.auth },
      };

      try {
        await webpush.sendNotification(subscription, payload);
        storage.registrarRecordatorioEnviado(r.sessionId, r.medId);
        console.log(`[push] Recordatorio enviado: ${r.usuarioNombre} → ${r.nombre} @ ${r.horario}`);
      } catch (err: any) {
        if (err?.statusCode === 410) {
          // Suscripción expirada — eliminar
          storage.deletePushSuscripcion(r.endpoint);
          console.log(`[push] Suscripción expirada eliminada: ${r.endpoint.slice(0, 40)}...`);
        } else {
          console.error(`[push] Error enviando a ${r.usuarioNombre}:`, err?.message);
        }
      }
    }
  } catch (err: any) {
    console.error("[push] Error en cron de recordatorios:", err?.message);
  }
}

// Iniciar cron: ejecutar cada minuto, sincronizado con el reloj
export function iniciarCronRecordatorios() {
  console.log("[push] Cron de recordatorios iniciado");

  const tick = () => {
    enviarRecordatorios();
    // Calcular ms hasta el próximo minuto exacto
    const ahora = new Date();
    const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds() + 100;
    setTimeout(tick, msHastaProximoMinuto);
  };

  // Esperar al próximo minuto exacto para sincronizar
  const ahora = new Date();
  const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds() + 100;
  setTimeout(tick, msHastaProximoMinuto);
}
