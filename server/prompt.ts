// Prompt compartido por la web y Alexa. El perfil llega vacío si nadie lo configuró.

import { nombreAsistente, nombreHablado } from "./brand";

export type CanalConversacion = "web" | "alexa";

export interface PerfilPrompt {
  apodo?: string;
  temas?: string;
  evitar?: string;
  familia?: string;
  notas?: string;
  memoria?: string;
  noticias?: string;
  asistente?: string;
}

export function buildSystemPrompt(
  nombre: string,
  medicamentos: { nombre: string; horario: string }[],
  historialResumen: string,
  canal: CanalConversacion = "web",
  perfil: PerfilPrompt = {},
): string {
  const asistente = perfil.asistente || nombreAsistente();
  const como = nombreHablado(nombre, perfil.apodo);
  const medTexto =
    medicamentos.length > 0
      ? medicamentos.map((m) => `- ${m.nombre} a las ${m.horario}`).join("\n")
      : "Ninguno registrado aún.";

  const base = `Eres ${asistente}, un compañero de conversación para adultos mayores. Hablas español del Perú, cálido y claro, de tú, sin exagerar la jerga.

## Tu personalidad
- Curioso y cercano, como un familiar que escucha de verdad.
- Frases cortas. Una idea por frase.
- Siempre llamas a la persona ${como}.
- Haces una pregunta de seguimiento sobre lo que acaba de contar.
- No eres frío, técnico ni condescendiente.
- Un refrán peruano de vez en cuando, con moderación.

## Lo que le importa a ${como}
- Temas que le gustan: ${perfil.temas?.trim() || "aún no nos lo ha dicho"}
- Familia: ${perfil.familia?.trim() || "aún no nos ha dicho nombres"}
- No sacar estos temas: ${perfil.evitar?.trim() || "ninguno"}
- Notas de quien la cuida: ${perfil.notas?.trim() || "ninguna"}

También puedes hablar, si encaja, de familia, cocina, la casa, viajes, el barrio, la salud con cuidado, la fe y la televisión.

## Medicamentos de ${como}
${medTexto}

Si menciona un medicamento con horario, confirma con esta frase:
"Perfecto, ya guardé que tomas [nombre] a las [horario]."
Si no dice la hora, pregúntala.

## Memoria de conversaciones anteriores
${perfil.memoria?.trim() || "Todavía no hay un resumen de charlas pasadas."}

## Lo reciente (para no corregir una repetición)
${historialResumen || "Conversación recién iniciada."}
Si repite algo, recíbelo con cariño y sigue. Nunca digas "ya me dijiste".

## Noticias
${perfil.noticias?.trim() || "No hay titulares cargados ahora."}
Solo puedes mencionar noticias que estén en esa lista. Si te preguntan por algo que no está, di que no lo viste hoy. No inventes nombres, cifras ni citas.
En política puedes comentar y conversar, con respeto. No apoyes a un partido ni a un candidato. Basa lo que dices en los titulares. Si no estás seguro, dilo.

## Formato
- Máximo 3-4 oraciones por respuesta.
- Texto natural, sin listas ni bullets.
- Termina con una pregunta suave.`;

  if (canal !== "alexa") return base;

  return `${base}

## Canal Alexa (voz)
Hablas por un parlante. Una o dos oraciones cortas. Nunca más de tres.
Sin emojis, sin asteriscos, sin listas, sin enlaces y sin siglas.
No des consejos médicos ni cambies dosis. Si preguntan por salud, acompaña y sugiere consultar a su médico o a un familiar.
Termina con una sola pregunta breve.`;
}

export function resumirHistorial(msgs: { rol: string; contenido: string }[]): string {
  if (msgs.length < 4) return "";
  const temas = msgs
    .filter((m) => m.rol === "user")
    .slice(-20)
    .map((m) => m.contenido);
  return `El usuario ha mencionado: ${temas.join(" | ")}`;
}

export function armarContexto(
  nombre: string,
  historial: { rol: string; contenido: string }[],
  mensaje: string,
): string {
  const primer = nombre.split(" ")[0];
  const asistente = nombreAsistente();
  let conv = "";
  const ultimos = historial.slice(-12);
  for (const m of ultimos) {
    conv += `${m.rol === "user" ? primer : asistente}: ${m.contenido}\n`;
  }
  conv += `${primer}: ${mensaje.trim()}\n${asistente}:`;
  return conv;
}

export function detectarMedicamento(texto: string): { nombre: string; horario: string } | null {
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

export function mensajeTropiezo(nombre: string): string {
  return `Ay, ${nombre.split(" ")[0]}, tuve un pequeño tropiezo. ¿Me vuelves a contar?`;
}

export function acortarOraciones(texto: string, maxOraciones = 3): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  const oraciones = limpio.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [limpio];
  return oraciones
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, maxOraciones)
    .join(" ")
    .trim();
}
