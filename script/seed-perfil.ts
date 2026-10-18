/**
 * Carga un perfil desde un JSON que NO está en git.
 *
 *   PERFIL_SEED_PATH=/ruta/fuera/del/repo/perfil.json npx tsx script/seed-perfil.ts
 *   npx tsx script/seed-perfil.ts /ruta/fuera/del/repo/perfil.json
 *
 * En Render el shell de producción no trae tsx (npm install --omit=dev).
 * Ahí el camino es el panel https://quetai.onrender.com/#/admin
 */
import fs from "fs";
import { storage } from "../server/storage";

interface Semilla {
  sessionId?: string;
  alexaUserId?: string;
  nombre?: string;
  locale?: string;
  apodo?: string;
  temas?: string;
  evitar?: string;
  familia?: string;
  notas?: string;
}

const ruta = process.env.PERFIL_SEED_PATH || process.argv[2];
if (!ruta) {
  console.error("Falta la ruta. Usa PERFIL_SEED_PATH o pásala como argumento. Copia script/perfil.example.json fuera del repo.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(ruta, "utf8")) as Semilla;

async function main() {
  let sessionId = (data.sessionId || "").trim();

  if (!sessionId && data.alexaUserId) {
    const creado = await storage.registerAlexaUsuario(data.alexaUserId.trim(), (data.nombre || "Familiar").trim(), data.locale || "es-US");
    sessionId = creado.sessionId;
  }

  if (!sessionId) {
    console.error("El JSON necesita sessionId o alexaUserId.");
    process.exit(1);
  }

  if (!await storage.getUsuario(sessionId)) {
    await storage.createUsuario(sessionId, (data.nombre || "Familiar").trim());
  }

  const perfil = await storage.savePerfil(sessionId, {
    apodo: data.apodo ?? "",
    temas: data.temas ?? "",
    evitar: data.evitar ?? "",
    familia: data.familia ?? "",
    notas: data.notas ?? "",
  }, "replace");

  console.log("Perfil guardado para", perfil.sessionId);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
