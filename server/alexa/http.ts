import { verifyAlexaRequest, type VerifyResult } from "./verify";
import type { AlexaRequestBody } from "./types";
import type { HandlerResult } from "./handler";

export async function processAlexaHttp(input: {
  rawBody: Buffer;
  signature?: string;
  certUrl?: string;
  skipVerification?: boolean;
  verify?: typeof verifyAlexaRequest;
  handle: (body: AlexaRequestBody) => Promise<HandlerResult>;
  now?: Date;
}): Promise<{ status: number; json: unknown }> {
  if (!input.rawBody || input.rawBody.length === 0) {
    return { status: 400, json: { error: "cuerpo vacío" } };
  }

  let body: AlexaRequestBody;
  try {
    body = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    return { status: 400, json: { error: "json inválido" } };
  }
  if (!body || typeof body !== "object") {
    return { status: 400, json: { error: "json inválido" } };
  }

  if (!input.skipVerification) {
    const verify = input.verify ?? verifyAlexaRequest;
    const result: VerifyResult = await verify({
      certUrl: input.certUrl,
      signature: input.signature,
      rawBody: input.rawBody,
      timestamp: body.request?.timestamp,
      now: input.now,
    });
    if (!result.ok) {
      console.warn("[alexa] solicitud rechazada:", result.reason);
      return { status: result.status, json: { error: "solicitud no válida" } };
    }
  }

  const handled = await input.handle(body);
  return { status: handled.status, json: handled.body };
}
