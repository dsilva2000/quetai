export interface PartesZona {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function partesEnZona(date: Date, timeZone: string): PartesZona {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) bag[p.type] = p.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function isoLocal(p: { year: number; month: number; day: number; hour: number; minute: number; second?: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second ?? 0)}.000`;
}

function sumarDias(year: number, month: number, day: number, dias: number) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** Próxima ocurrencia estrictamente futura de HH:MM en la zona indicada. */
export function proximaOcurrencia(horario: string, now: Date, timeZone: string): string | null {
  const m = horario.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const hoy = partesEnZona(now, timeZone);
  const yaPaso = hour < hoy.hour || (hour === hoy.hour && minute <= hoy.minute);
  const fecha = yaPaso ? sumarDias(hoy.year, hoy.month, hoy.day, 1) : { year: hoy.year, month: hoy.month, day: hoy.day };
  return isoLocal({ ...fecha, hour, minute, second: 0 });
}

export function buildReminderPayload(input: {
  now: Date;
  timeZone: string;
  horario: string;
  texto: string;
  locale: string;
}): Record<string, unknown> | null {
  const cuando = proximaOcurrencia(input.horario, input.now, input.timeZone);
  if (!cuando) return null;
  const local = partesEnZona(input.now, input.timeZone);
  const [hh, mm] = input.horario.split(":");
  return {
    requestTime: isoLocal(local),
    trigger: {
      type: "SCHEDULED_ABSOLUTE",
      scheduledTime: cuando,
      timeZoneId: input.timeZone,
      recurrence: {
        startDateTime: cuando,
        recurrenceRules: [
          `FREQ=DAILY;BYHOUR=${Number(hh)};BYMINUTE=${Number(mm)};BYSECOND=0;INTERVAL=1;`,
        ],
      },
    },
    alertInfo: {
      spokenInfo: {
        content: [
          {
            locale: input.locale,
            text: input.texto,
          },
        ],
      },
    },
    pushNotification: { status: "ENABLED" },
  };
}

export async function crearRecordatorioDiario(
  input: {
    apiEndpoint: string;
    apiAccessToken: string;
    texto: string;
    horario: string;
    locale: string;
    now: Date;
    timeZone: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<"ok" | "sin_permiso" | "error"> {
  const body = buildReminderPayload(input);
  if (!body) return "error";
  const base = input.apiEndpoint.replace(/\/$/, "");
  try {
    const res = await fetchImpl(`${base}/v1/alerts/reminders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 201 || res.status === 200) return "ok";
    if (res.status === 401 || res.status === 403) return "sin_permiso";
    console.error("[alexa] recordatorio HTTP", res.status);
    return "error";
  } catch (err: any) {
    console.error("[alexa] recordatorio:", err?.message || err);
    return "error";
  }
}
