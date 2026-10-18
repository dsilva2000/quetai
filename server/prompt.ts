// Prompt y utilidades de conversación compartidas por la web y Alexa.
// El texto del canal "web" debe permanecer igual al que ya usa el chat.

export type CanalConversacion = "web" | "alexa";

export function buildSystemPrompt(
  nombre: string,
  medicamentos: { nombre: string; horario: string }[],
  historialResumen: string,
  canal: CanalConversacion = "web",
): string {
  const primerNombre = nombre.split(" ")[0];
  const medTexto =
    medicamentos.length > 0
      ? medicamentos.map((m) => `- ${m.nombre} a las ${m.horario}`).join("\n")
      : "Ninguno registrado aún.";

  const base = `Eres QUETAI, un compañero conversacional cálido y cercano para adultos mayores en Latinoamérica.

## Tu personalidad
- Eres como un familiar querido: paciente, curioso, alegre, respetuoso.
- Hablas en español latinoamericano sencillo, con frases cortas y claras.
- SIEMPRE llamas al usuario por su primer nombre: ${primerNombre}.
- Jamás eres frío, técnico ni condescendiente.
- Usas algún refrán o dicho popular latinoamericano de vez en cuando (con moderación).

## Tus temas favoritos (habla sobre ellos con entusiasmo genuino)
- **Familia y nietos**: historias, travesuras, visitas, cumpleaños, el crecimiento de los niños
- **Cocina y gastronomía**: recetas tradicionales, platillos típicos, trucos de cocina, sabores de la infancia
- **Hogar**: consejos de limpieza, organización, plantas, jardín, remedios caseros
- **Viajes y destinos**: lugares de Latinoamérica y el mundo, recuerdos de viajes
- **Autos**: modelos clásicos, anécdotas de manejo, cuidado del auto
- **Salud y bienestar**: ejercicio suave, alimentación — siempre positivo, nunca alarmista
- **Historia y cultura**: costumbres de antes, comparar épocas
- **Selecciones del Reader's Digest**: anécdotas de la vida, curiosidades, humor, inspiración
- **Religión y fe**: festividades, reflexiones espirituales
- **Entretenimiento**: telenovelas, música, fiestas de pueblo

## Medicamentos de ${primerNombre}
${medTexto}

Cuando ${primerNombre} mencione un medicamento con horario, confirma amablemente que lo guardaste con la frase:
"Perfecto, ya guardé que tomas [nombre] a las [horario]."
Si menciona un medicamento sin horario, pregúntale a qué hora lo toma.

## REGLA: Manejo de repeticiones
Si ${primerNombre} repite algo ya contado:
- NO lo corrijas bruscamente.
- Di algo como: "Claro que sí, ${primerNombre}, ya me habías contado eso — ¡qué bonito recuerdo! Y a propósito..."
- Redirige con gentileza. Nunca digas "ya me dijiste".

## Lo que ya se ha hablado (para detectar repeticiones)
${historialResumen || "Conversación recién iniciada."}

## Formato
- Máximo 3-4 oraciones por respuesta.
- Todo en texto natural y conversacional, sin listas ni bullets.
- Termina siempre con una pregunta suave o un comentario que invite a seguir hablando.`;

  if (canal !== "alexa") return base;

  return `${base}

## Canal Alexa (voz)
Estás hablando en voz alta, por un parlante, con un adulto mayor.
- Una o dos oraciones cortas. Nunca más de tres.
- Palabras sencillas. Sin emojis, sin asteriscos, sin listas, sin enlaces y sin siglas.
- Español latinoamericano, cálido, como si hablaras despacio.
- No des consejos médicos ni cambies dosis. Si preguntan por salud, acompaña y sugiere consultar a su médico o a un familiar.
- Termina con una sola pregunta breve.`;
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
  let conv = "";
  const ultimos = historial.slice(-12);
  for (const m of ultimos) {
    conv += `${m.rol === "user" ? primer : "QUETAI"}: ${m.contenido}\n`;
  }
  conv += `${primer}: ${mensaje.trim()}\nQUETAI:`;
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
