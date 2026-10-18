/** Marker baked into dist/index.cjs. /api/health must show this after a real deploy. */
export const APP_RELEASE = "alexa-v2";

export function healthPayload(now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  return {
    status: "ok" as const,
    time: now.toISOString(),
    tz: env.TZ || "UTC",
    version: APP_RELEASE,
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
  };
}
