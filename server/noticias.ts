import { noticiasActivas } from "./brand";

export type TemaNoticia = "farandula" | "politica" | "actualidad";

export interface Titular {
  tema: TemaNoticia;
  titulo: string;
  medio?: string;
}

const CONSULTAS: Record<TemaNoticia, string> = {
  farandula: "farándula OR espectáculos Perú",
  politica: "política Perú",
  actualidad: "actualidad Perú",
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<TemaNoticia, { at: number; items: Titular[] }>();

export function resetNoticiasCache(): void {
  cache.clear();
}

export function urlRss(tema: TemaNoticia): string {
  const q = encodeURIComponent(CONSULTAS[tema]);
  return `https://news.google.com/rss/search?q=${q}&hl=es-419&gl=PE&ceid=PE:es-419`;
}

export function decodificarHtml(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function extraerTag(bloque: string, tag: string): string {
  const cdata = bloque.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, "i"));
  if (cdata) return cdata[1];
  const plano = bloque.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return plano?.[1] || "";
}

const FUENTES_DESCARTADAS = new Set(["facebook", "instagram", "tiktok", "youtube", "fb", "ig"]);

function quitarEmojis(texto: string): string {
  return texto
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/[\uFE00-\uFE0F]/g, "");
}

function separarMedio(texto: string): { titulo: string; medio: string } {
  const partes = texto
    .split(/\s+-\s+/)
    .map((parte) => parte.replace(/^[\s-]+|[\s-]+$/g, "").trim())
    .filter(Boolean);
  if (partes.length < 2) return { titulo: texto.trim(), medio: "" };
  const medio = partes[partes.length - 1];
  if (medio.length > 48 || medio.split(/\s+/).length > 6) return { titulo: texto.trim(), medio: "" };
  return { titulo: partes.slice(0, -1).join(". ").trim(), medio };
}

function quitarPrefijos(texto: string): string {
  let actual = texto;
  for (let i = 0; i < 3; i++) {
    actual = actual.replace(
      /^(?:lo\s*último|loúltimo|último|última hora|ultima hora|urgente|en vivo|exclusivo|alerta)\s*[|:—-]\s*/i,
      "",
    );
  }
  return actual.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
}

function quitarFrecuencias(texto: string): string {
  return texto
    .replace(/\b\d+(?:[.,]\d+)?\s*FM\b(?:\s+\d+(?:[.,]\d+)?)?(?:\s+señal digital(?:\s+abierta)?)?(?:\s+movistar\s*:\s*\d+\s*SD)?/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s+señal digital(?:\s+abierta)?/gi, " ")
    .replace(/\bseñal digital(?:\s+abierta)?\b/gi, " ")
    .replace(/\bmovistar\s*:\s*\d+\s*SD\b/gi, " ")
    .replace(/\b\d+\s*SD\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Corta en un punto o en un espacio. Nunca parte una palabra. */
export function recortarEnPalabra(texto: string, max = 120): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  let corteFrase = -1;
  for (let i = 0; i < max && i < limpio.length; i++) {
    if (".!?".includes(limpio[i])) corteFrase = i;
  }
  if (corteFrase >= 40) return limpio.slice(0, corteFrase + 1).trim();
  const espacio = limpio.lastIndexOf(" ", max);
  if (espacio >= 40) return limpio.slice(0, espacio).replace(/[,:;]+$/, "").trim();
  const siguiente = limpio.indexOf(" ");
  return (siguiente === -1 ? limpio : limpio.slice(0, siguiente)).trim();
}

/** Título de la noticia, sin la descripción y sin el medio. Null si el medio es una red. */
export function prepararTitular(crudo: string): { titulo: string; medio: string } | null {
  const base = quitarEmojis(crudo).replace(/\s+/g, " ").trim();
  if (!base) return null;
  const separado = separarMedio(base);
  if (FUENTES_DESCARTADAS.has(separado.medio.toLowerCase())) return null;
  let titulo = recortarEnPalabra(quitarFrecuencias(quitarPrefijos(separado.titulo)));
  titulo = titulo.replace(/[\s|.,:;!-]+$/g, "").trim();
  if (titulo.length < 12) return null;
  return { titulo, medio: separado.medio };
}

export function parseRss(xml: string, tema: TemaNoticia, max = 4): Titular[] {
  const trozos = xml.split(/<item\b/i).slice(1);
  const vistos = new Set<string>();
  const salida: Titular[] = [];
  for (const trozo of trozos) {
    const crudo = decodificarHtml(extraerTag(trozo, "title"));
    const listo = prepararTitular(crudo);
    if (!listo) continue;
    const clave = listo.titulo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ tema, titulo: listo.titulo, medio: listo.medio });
    if (salida.length >= max) break;
  }
  return salida;
}

export async function obtenerTitulares(
  temas: TemaNoticia[] = ["farandula", "politica", "actualidad"],
  opts: {
    now?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    ttlMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<Titular[]> {
  if (!noticiasActivas(opts.env)) return [];
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? TTL_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const faltan = temas.filter((tema) => {
    const guardado = cache.get(tema);
    return !guardado || now - guardado.at > ttl;
  });

  await Promise.all(faltan.map(async (tema) => {
    try {
      const res = await fetchImpl(urlRss(tema), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) return;
      const xml = await res.text();
      cache.set(tema, { at: now, items: parseRss(xml, tema) });
    } catch (err: any) {
      console.error("[noticias]", tema, err?.message || err);
    }
  }));

  return temas.flatMap((tema) => cache.get(tema)?.items || []);
}

export function formatearTitulares(items: Titular[]): string {
  if (items.length === 0) return "";
  const etiqueta: Record<TemaNoticia, string> = {
    farandula: "Farándula",
    politica: "Política",
    actualidad: "Actualidad",
  };
  return items.map((item) => {
    const medio = item.medio ? ` (según ${item.medio})` : "";
    return `- [${etiqueta[item.tema]}] ${item.titulo}${medio}`;
  }).join("\n");
}

function fraseHablada(item: Titular): string {
  const limpio = prepararTitular(item.titulo);
  const titulo = (limpio?.titulo || item.titulo).replace(/[.!?]+$/g, "");
  const medio = (item.medio || limpio?.medio || "").trim();
  const dicho = titulo.charAt(0).toLowerCase() + titulo.slice(1);
  return medio ? `${dicho}. Según ${medio}` : dicho;
}

export function respuestaDesdeTitulares(tema: TemaNoticia | "todos", items: Titular[], nombre: string): string {
  const propios = tema === "todos" ? items : items.filter((item) => item.tema === tema);
  const pool = propios.length > 0 ? propios : items;
  const elegidos = pool
    .map((item) => {
      const listo = prepararTitular(item.titulo);
      if (!listo) return null;
      return { ...item, titulo: listo.titulo, medio: item.medio || listo.medio };
    })
    .filter((item): item is Titular => !!item)
    .slice(0, 2);
  if (elegidos.length === 0) {
    return `${nombre}, ahora no tengo titulares frescos. No voy a inventarte una noticia. ¿Hablamos de otra cosa?`;
  }
  const primera = fraseHablada(elegidos[0]);
  const segunda = elegidos[1] ? ` También, ${fraseHablada(elegidos[1])}.` : "";
  if (tema === "politica") {
    return `${nombre}, de política te cuento esto, sin tomar partido. ${primera}.${segunda} ¿Quieres que te cuente más?`;
  }
  if (tema === "farandula") {
    return `${nombre}, ¿te enteraste? Dicen que ${primera}.${segunda} ¿Quieres que te cuente más?`;
  }
  return `${nombre}, hoy se comenta esto. ${primera}.${segunda} ¿Quieres que te cuente más?`;
}
