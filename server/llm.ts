import OpenAI from "openai";

let cliente: OpenAI | null = null;

function openai(): OpenAI {
  if (!cliente) cliente = new OpenAI();
  return cliente;
}

/**
 * Groq apagó estos ids el 16 de agosto de 2026 (free y developer).
 * El reemplazo oficial está en console.groq.com/docs/deprecations.
 */
const MODELOS_RETIRADOS: Record<string, string> = {
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
};

function modeloVigente(id: string): string {
  return MODELOS_RETIRADOS[id] || id;
}

/** Modelo principal. En Groq, el reemplazo de llama-3.3-70b-versatile. */
export function modeloPrincipal(env: NodeJS.ProcessEnv = process.env): string {
  const pedido = (env.LLM_MODEL || "openai/gpt-oss-120b").trim();
  return modeloVigente(pedido);
}

/** Modelo rápido si el principal falla. Reemplazo de llama-3.1-8b-instant. */
export function modeloFallback(env: NodeJS.ProcessEnv = process.env): string {
  const pedido = (env.LLM_MODEL_FALLBACK || "openai/gpt-oss-20b").trim();
  return modeloVigente(pedido);
}

export function resumenErrorLlm(err: unknown): { clase: string; status: number | null; codigo: string | null; detalle: string } {
  const e = err as { name?: string; status?: number; code?: string; message?: string; error?: { code?: string; message?: string } };
  const clase = e?.name || "Error";
  const status = typeof e?.status === "number" ? e.status : null;
  const codigo = typeof e?.code === "string" ? e.code : (typeof e?.error?.code === "string" ? e.error.code : null);
  const crudo = String(e?.message || e?.error?.message || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return { clase, status, codigo, detalle: crudo.slice(0, 200) };
}

export function logLlm(evento: string, modelo: string, inicio: number, err?: unknown): void {
  const fila: Record<string, unknown> = { evento, modelo, ms: Date.now() - inicio };
  if (err) Object.assign(fila, resumenErrorLlm(err));
  const linea = JSON.stringify(fila);
  if (err) console.error(linea);
  else console.log(linea);
}

export function timeoutAlexaMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.ALEXA_LLM_TIMEOUT_MS || 5500);
  return Number.isFinite(n) && n >= 1000 ? n : 5500;
}

export async function completarTexto(opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  model?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const env = opts.env || process.env;
  const primario = opts.model || modeloPrincipal(env);
  const fallback = modeloFallback(env);
  const inicio = Date.now();
  try {
    const texto = await unaVez(primario, opts);
    logLlm("llm.ok", primario, inicio);
    return texto;
  } catch (err: any) {
    logLlm("llm.error", primario, inicio, err);
    if (!fallback || fallback === primario) throw err;
    const corto = opts.timeoutMs ? Math.min(opts.timeoutMs, 4000) : undefined;
    const inicioFallback = Date.now();
    try {
      const texto = await unaVez(fallback, { ...opts, timeoutMs: corto });
      logLlm("llm.fallback.ok", fallback, inicioFallback);
      return texto;
    } catch (err2: any) {
      logLlm("llm.fallback.error", fallback, inicioFallback, err2);
      throw err2;
    }
  }
}

async function unaVez(model: string, opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const cuerpo: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    stream: false,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.7,
  };
  if (model.includes("gpt-oss")) cuerpo.reasoning_effort = "low";
  const res = await openai().chat.completions.create(
    cuerpo as any,
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
  const texto = res.choices[0]?.message?.content?.trim() || "";
  if (!texto) {
    const vacio = new Error("respuesta vacía");
    (vacio as { code?: string }).code = "empty_content";
    throw vacio;
  }
  return texto;
}

export function crearStream(system: string, user: string, env: NodeJS.ProcessEnv = process.env) {
  const model = modeloPrincipal(env);
  const cuerpo: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: true,
    max_tokens: 500,
    temperature: 0.8,
  };
  if (model.includes("gpt-oss")) cuerpo.reasoning_effort = "low";
  return openai().chat.completions.create(cuerpo as any);
}
