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
  const base = preferido || nombreLegal || "amigo";
  return base.split(/\s+/)[0] || "amigo";
}
