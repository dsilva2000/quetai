/** Nombre del asistente. Cada familia puede cambiarlo con ASSISTANT_NAME. */
export function nombreAsistente(env: NodeJS.ProcessEnv = process.env): string {
  const nombre = (env.ASSISTANT_NAME || "Quetai").trim();
  return nombre.slice(0, 40) || "Quetai";
}

export function noticiasActivas(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEWS_ENABLED !== "false";
}

export function nombreHablado(nombreLegal: string, apodo?: string | null): string {
  const preferido = (apodo || "").trim();
  const base = preferido || nombreLegal || "Amigo";
  return base.split(/\s+/)[0] || "Amigo";
}

/** Mayúscula en la primera letra, sin tocar ¿ ni ¡. */
export function capitalizarFrase(texto: string): string {
  const match = /^(\s*[¿¡]*)(\s*)([^\s¿¡])/.exec(texto);
  if (!match) return texto;
  const corte = match[1].length + match[2].length;
  const letra = texto.charAt(corte);
  return texto.slice(0, corte) + letra.toUpperCase() + texto.slice(corte + 1);
}
