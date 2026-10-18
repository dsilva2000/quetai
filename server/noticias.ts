import { noticiasActivas } from "./brand";

export type TemaNoticia = "farandula" | "politica" | "actualidad";

export interface Titular {
  tema: TemaNoticia;
  titulo: string;
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

export function parseRss(xml: string, tema: TemaNoticia, max = 4): Titular[] {
  const trozos = xml.split(/<item\b/i).slice(1);
  const vistos = new Set<string>();
  const salida: Titular[] = [];
  for (const trozo of trozos) {
    const titulo = decodificarHtml(extraerTag(trozo, "title"));
    if (!titulo) continue;
    const clave = titulo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ tema, titulo });
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
  return items.map((item) => `- [${etiqueta[item.tema]}] ${item.titulo}`).join("\n");
}

export function respuestaDesdeTitulares(tema: TemaNoticia | "todos", items: Titular[], nombre: string): string {
  const propios = tema === "todos" ? items : items.filter((item) => item.tema === tema);
  const elegidos = (propios.length > 0 ? propios : items).slice(0, 2);
  if (elegidos.length === 0) {
    return `${nombre}, ahora no tengo titulares frescos. No voy a inventarte una noticia. ¿Hablamos de otra cosa?`;
  }
  const intro = tema === "politica"
    ? `${nombre}, te cuento titulares de política, sin tomar partido.`
    : tema === "farandula"
      ? `${nombre}, de chisme y farándula hoy salió esto.`
      : `${nombre}, en las noticias de hoy vi esto.`;
  const cuerpo = elegidos.map((item) => item.titulo).join(" También: ");
  return `${intro} ${cuerpo}. ¿Quieres que te cuente solo una?`;
}
