const PALABRAS: Record<string, number> = {
  cero: 0,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
};

function fmt(horas: number, minutos: number): string | null {
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function ajustarPeriodo(horas: number, texto: string): number {
  const tarde = /tarde|noche|pm|p\.m/.test(texto);
  const manana = /mañana|manana|am|a\.m/.test(texto);
  if (tarde && horas < 12) return horas + 12;
  if (manana && horas === 12) return 0;
  return horas;
}

/** Convierte una hora dicha en español o un AMAZON.TIME a HH:MM (24 h). */
export function parseHoraLibre(texto: string): string | null {
  const s = texto.toLowerCase().normalize("NFC").trim();
  if (!s) return null;

  const reloj = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (reloj) {
    return fmt(ajustarPeriodo(parseInt(reloj[1], 10), s), parseInt(reloj[2], 10));
  }

  const digito = s.match(/\b(\d{1,2})\b/);
  if (digito) {
    let horas = parseInt(digito[1], 10);
    let minutos = 0;
    if (/y media/.test(s)) minutos = 30;
    else if (/y cuarto/.test(s)) minutos = 15;
    const y = s.match(/y\s+(\d{1,2})/);
    if (y) minutos = parseInt(y[1], 10);
    if (horas > 23 && horas <= 24) return null;
    return fmt(ajustarPeriodo(horas, s), minutos);
  }

  const claves = Object.keys(PALABRAS).sort((a, b) => b.length - a.length);
  for (const palabra of claves) {
    if (!new RegExp(`\\b${palabra}\\b`, "i").test(s)) continue;
    let horas = PALABRAS[palabra];
    let minutos = 0;
    if (/y media/.test(s)) minutos = 30;
    else if (/y cuarto/.test(s)) minutos = 15;
    const y = s.match(/y\s+(\d{1,2})/);
    if (y) minutos = parseInt(y[1], 10);
    if (horas <= 12) horas = ajustarPeriodo(horas, s);
    return fmt(horas, minutos);
  }

  return null;
}

/** True cuando la frase parece una respuesta a "¿a qué hora?". */
export function pareceHora(texto: string): boolean {
  const s = texto.toLowerCase().trim();
  if (!s || s.length > 60) return false;
  if (/\d{1,2}\s*:\s*\d{2}/.test(s)) return true;
  if (/\b(a las|las|am|pm|mañana|manana|tarde|noche|mediodia|mediodía)\b/.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= 3 && parseHoraLibre(s) !== null;
}

export function horaParaVoz(horario: string): string {
  const parsed = parseHoraLibre(horario) || horario;
  const m = parsed.match(/^(\d{2}):(\d{2})$/);
  if (!m) return horario;
  const horas = parseInt(m[1], 10);
  const minutos = parseInt(m[2], 10);
  const h12 = horas % 12 === 0 ? 12 : horas % 12;
  const periodo =
    horas < 12 ? "de la mañana" : horas < 19 ? "de la tarde" : "de la noche";
  if (horas === 12 && minutos === 0) return "12 del día";
  if (minutos === 0) return `${h12} ${periodo}`;
  return `${h12} y ${minutos} ${periodo}`;
}

export function limpiarMedicamento(texto: string): string {
  return texto
    .replace(/^(el|la|los|las|un|una|mi|mis|su)\s+/i, "")
    .replace(/[.,!¡¿?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NO_ES_NOMBRE = new Set([
  "hola", "buenas", "buenos", "dias", "días", "tardes", "noches", "ayuda",
  "si", "sí", "no", "quetai", "alexa", "gracias", "ok", "okay", "bueno",
  "nada", "este", "eso", "aqui", "aquí",
]);

export function extraerNombre(texto: string): string | null {
  let t = texto.trim();
  t = t.replace(/^(hola|buenos días|buenos dias|buenas tardes|buenas noches)[, ]+/i, "");
  t = t.replace(/^(me llamo|mi nombre es|yo me llamo|puedes llamarme|llámame|llamame|yo soy|soy)\s+/i, "");
  t = t.replace(/[.,!¡¿?]/g, "").trim();
  if (!t || t.length > 40) return null;
  const words = t.split(/\s+/);
  if (words.length === 0 || words.length > 4) return null;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\- ]+$/.test(t)) return null;
  if (words.every((w) => NO_ES_NOMBRE.has(w.toLocaleLowerCase("es")))) return null;
  if (words.some((w) => w.toLocaleLowerCase("es") === "quetai" || w.toLocaleLowerCase("es") === "alexa")) return null;
  return words
    .map((w) => w.charAt(0).toLocaleUpperCase("es") + w.slice(1).toLocaleLowerCase("es"))
    .join(" ");
}
