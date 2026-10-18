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

/** Partículas que pueden ir dentro de un nombre, pero no son el nombre. */
const RELLENO = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e", "da", "do", "san", "santa", "di",
  "al", "lo", "le", "se", "me", "te", "nos", "en", "un", "una",
]);

/**
 * Saludos, preguntas y palabras de función. Si aparece una, la frase no es un nombre.
 * Las claves van sin acento.
 */
const NO_ES_NOMBRE = new Set([
  "hola", "holas", "buenas", "buenos", "buena", "bueno", "dias", "dia", "tardes", "tarde",
  "noches", "noche", "ayuda", "si", "no", "quetai", "alexa", "gracias", "ok", "okay",
  "nada", "este", "eso", "esto", "aqui", "alla", "ahi", "como", "que", "cual", "quien",
  "quienes", "cuando", "donde", "por", "para", "con", "estas", "esta", "estoy", "estamos",
  "estan", "bien", "mal", "muy", "mas", "hoy", "ayer", "manana", "fui", "fue", "voy", "vas",
  "va", "vamos", "quiero", "quieres", "puedes", "puede", "dime", "llamo", "llamas", "soy",
  "eres", "somos", "cuentame", "cuento", "sabes", "oye", "escucha", "mercado", "compre",
  "compro", "repite", "chau", "chao", "adios", "hasta", "luego", "pronto", "tal", "pasa",
  "paso", "favor", "algo", "todo", "todos", "gusta", "vine", "vino", "fueron", "sali",
  "salio", "siento", "siente", "ando", "anda", "tengo", "tiene", "tienes", "feliz", "triste",
  "cansado", "cansada", "solo", "sola", "mi", "mis", "tu", "tus", "su", "sus",
]);

const CHARLA_CORTA: Record<string, string> = {
  como: "cómo estás",
  que: "qué tal",
  hola: "hola",
  buenas: "buenas",
  buenos: "buenos días",
  bien: "estoy bien",
  estas: "cómo estás",
  "como estas": "cómo estás",
  "que tal": "qué tal",
  "como estas hoy": "cómo estás",
};

export function clavePalabra(texto: string): string {
  return texto
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un fragmento como "Cómo" vuelve a la frase que la persona quiso decir. */
export function textoDeCharla(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return CHARLA_CORTA[clavePalabra(limpio)] || limpio;
}

export function extraerNombre(texto: string): string | null {
  let t = texto.trim();
  t = t.replace(/^(hola|buenos días|buenos dias|buenas tardes|buenas noches)[, ]+/i, "");
  t = t.replace(/^(?:me llamo|mi nombre es|yo me llamo|puedes llamarme|llámame|llamame|di me|dime|yo soy|soy)\s+/i, "");
  t = t.replace(/[.,!¡¿?]/g, "").trim();
  if (!t || t.length > 40) return null;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’\- ]+$/.test(t)) return null;
  const claves = words.map((w) => clavePalabra(w));
  if (claves.some((w) => NO_ES_NOMBRE.has(w))) return null;
  const propios = words.filter((_, i) => !RELLENO.has(claves[i]) && claves[i].length >= 2);
  if (propios.length === 0) return null;
  return words
    .map((w) => w.charAt(0).toLocaleUpperCase("es") + w.slice(1).toLocaleLowerCase("es"))
    .join(" ");
}
