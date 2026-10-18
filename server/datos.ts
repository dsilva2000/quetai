import fs from "fs";
import path from "path";

/** True si `dir` es un punto de montaje, o vive dentro de uno. `/` no cuenta. */
export function directorioPersistente(dir: string, mounts: string): boolean {
  const normalizado = path.resolve(dir);
  for (const line of mounts.split("\n")) {
    if (!line.trim()) continue;
    const punto = line.split(" ")[1];
    if (!punto) continue;
    const decoded = punto.replace(/\\040/g, " ").replace(/\\011/g, "\t");
    if (!decoded || decoded === "/") continue;
    if (normalizado === decoded) return true;
    const base = decoded.endsWith("/") ? decoded : `${decoded}/`;
    if (normalizado.startsWith(base)) return true;
  }
  return false;
}

export function leerMontajes(ruta = "/proc/mounts"): string {
  try {
    return fs.readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

export function resolverDirectorioDatos(env: NodeJS.ProcessEnv, cwd: string): string {
  const pedido = (env.DATA_DIR || "").trim();
  if (pedido) return pedido;
  return path.join(cwd, "data");
}
