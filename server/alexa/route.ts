import type { Express, Request, Response } from "express";
import { handleAlexaRequest } from "./handler";
import { processAlexaHttp } from "./http";
import { alexaMemory } from "./memory";
import { enviarProgreso } from "./progreso";
import { crearRecordatorioDiario } from "./reminder";

function rawBodyDe(req: Request): Buffer {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw);
  return Buffer.alloc(0);
}

export function registerAlexaRoutes(app: Express) {
  app.get("/api/alexa", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      servicio: "quetai-alexa",
      verificacion: process.env.ALEXA_SKIP_VERIFICATION === "true" ? "desactivada" : "activa",
    });
  });

  app.post("/api/alexa", async (req: Request, res: Response) => {
    const skip = process.env.ALEXA_SKIP_VERIFICATION === "true";
    if (skip) console.warn("[alexa] ALEXA_SKIP_VERIFICATION está activo. No lo dejes así en producción.");

    try {
      const result = await processAlexaHttp({
        rawBody: rawBodyDe(req),
        signature: req.get("signature") || undefined,
        certUrl: req.get("signaturecertchainurl") || undefined,
        skipVerification: skip,
        handle: (body) =>
          handleAlexaRequest(body, {
            memory: alexaMemory,
            skillId: process.env.ALEXA_SKILL_ID || "",
            timeZone: process.env.TZ || "America/Lima",
            crearRecordatorio: crearRecordatorioDiario,
            progreso: (body) => enviarProgreso(body),
          }),
      });
      res.status(result.status).json(result.json);
    } catch (err: any) {
      console.error("[alexa] error no controlado:", err?.message || err);
      res.status(500).json({ error: "error interno" });
    }
  });
}
