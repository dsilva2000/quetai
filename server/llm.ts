import OpenAI from "openai";

let cliente: OpenAI | null = null;

function openai(): OpenAI {
  if (!cliente) cliente = new OpenAI();
  return cliente;
}

/** Modelo principal. En Groq, llama-3.3-70b-versatile es el fuerte que ya usa Quetai. */
export function modeloPrincipal(env: NodeJS.ProcessEnv = process.env): string {
  return (env.LLM_MODEL || "llama-3.3-70b-versatile").trim();
}

/** Modelo rápido si el principal falla o no alcanza el límite de Alexa. */
export function modeloFallback(env: NodeJS.ProcessEnv = process.env): string {
  return (env.LLM_MODEL_FALLBACK || "llama-3.1-8b-instant").trim();
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
  try {
    return await unaVez(primario, opts);
  } catch (err: any) {
    if (!fallback || fallback === primario) throw err;
    console.error("[llm] modelo primario falló, uso fallback:", err?.message || err);
    const corto = opts.timeoutMs ? Math.min(opts.timeoutMs, 1800) : undefined;
    return await unaVez(fallback, { ...opts, timeoutMs: corto });
  }
}

async function unaVez(model: string, opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const res = await openai().chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      stream: false,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs, signal: AbortSignal.timeout(opts.timeoutMs) } : undefined,
  );
  return res.choices[0]?.message?.content?.trim() || "";
}

export function crearStream(system: string, user: string, env: NodeJS.ProcessEnv = process.env) {
  return openai().chat.completions.create({
    model: modeloPrincipal(env),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: true,
    max_tokens: 300,
    temperature: 0.8,
  });
}
