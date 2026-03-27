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

// Parsear horario en cualquier formato natural que use un adulto mayor
function parsearHorario(horario: string): { horas: number; minutos: number } | null {
  const s = horario.toLowerCase().trim();

  // Normalizar separadores: "8.37" → "8:37", "8 37" → "8:37"
  const normalizado = s
    .replace(/(\d)\.(\d)/g, "$1:$2")       // 8.37 → 8:37
    .replace(/(\d)\s+(\d{2})(?=\s|$|\s*(am|pm|de))/g, "$1:$2"); // "8 37 pm" → "8:37 pm"

  // Extraer periodo am/pm y texto de período
  const esPm = /pm|p\.m|tarde|noche/.test(normalizado);
  const esAm = /am|a\.m|ma[ñn]ana/.test(normalizado);

  // Buscar HH:MM o H:MM
  const matchHHMM = normalizado.match(/(\d{1,2}):(\d{2})/);
  if (matchHHMM) {
    let h = parseInt(matchHHMM[1]);
    const m = parseInt(matchHHMM[2]);
    if (esPm && h < 12) h += 12;
    if (esAm && h === 12) h = 0;
    // Hora militar directa (13-23) → ya es PM
    return { horas: h % 24, minutos: m };
  }

  // Solo hora + am/pm: "8pm", "8 pm", "8am"
  const matchHAmPm = normalizado.match(/(\d{1,2})\s*(am|pm|a\.m|p\.m)/);
  if (matchHAmPm) {
    let h = parseInt(matchHAmPm[1]);
    const p = matchHAmPm[2];
    if ((p.startsWith("p")) && h < 12) h += 12;
    if ((p.startsWith("a")) && h === 12) h = 0;
    return { horas: h, minutos: 0 };
  }

  // Con texto de período: "8 de la tarde", "8 de la mañana"
  const matchPeriodo = normalizado.match(/(\d{1,2})\s*(?:de la\s*)?(ma[ñn]ana|tarde|noche)/);
  if (matchPeriodo) {
    let h = parseInt(matchPeriodo[1]);
    const p = matchPeriodo[2];
    if ((p === "tarde" || p === "noche") && h < 12) h += 12;
    return { horas: h, minutos: 0 };
  }

  // Solo número: "8", "13"
  const matchSolo = normalizado.match(/^(\d{1,2})$/);
  if (matchSolo) {
    return { horas: parseInt(matchSolo[1]) % 24, minutos: 0 };
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
