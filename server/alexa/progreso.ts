import type { AlexaRequestBody } from "./types";

/** Aviso hablado mientras el modelo responde. Alexa igual exige la respuesta final en unos 8 segundos. */
export async function enviarProgreso(body: AlexaRequestBody, texto = "Un momento."): Promise<void> {
  const token = body.context?.System?.apiAccessToken;
  const endpoint = body.context?.System?.apiEndpoint;
  const requestId = body.request?.requestId;
  if (!token || !endpoint || !requestId) return;
  const url = `${endpoint.replace(/\/$/, "")}/v1/directives`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      header: { requestId },
      directive: { type: "VoicePlayer.Speak", speech: texto },
    }),
    signal: AbortSignal.timeout(1200),
  });
  if (!res.ok) {
    console.error("[alexa] progreso HTTP", res.status);
  }
}
