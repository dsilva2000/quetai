// QUETAI — Voz nativa para APK Android via Capacitor
// Maneja TTS y STT usando los motores nativos del dispositivo

export function isCapacitorApp(): boolean {
  return typeof (window as any).Capacitor !== "undefined" &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

// ── TTS nativo: hablar texto ──────────────────────────────────────────────────
export async function hablarNativo(
  texto: string,
  onFin?: () => void
): Promise<void> {
  const cap = (window as any).Capacitor;
  const tts = cap?.Plugins?.TextToSpeech;

  if (!tts) {
    console.warn("[voz] Plugin TTS no disponible");
    onFin?.();
    return;
  }

  try {
    // Detener cualquier habla anterior
    await tts.stop?.().catch(() => {});

    await tts.speak({
      text: texto,
      lang: "es-419",
      rate: 0.9,
      pitch: 1.05,
      volume: 1.0,
      category: "ambient",
    });
    onFin?.();
  } catch (err) {
    console.error("[voz] Error TTS nativo:", err);
    onFin?.();
  }
}

// ── STT nativo: escuchar voz ──────────────────────────────────────────────────
export async function pedirPermisoMicrofono(): Promise<boolean> {
  const cap = (window as any).Capacitor;
  const stt = cap?.Plugins?.SpeechRecognition;
  if (!stt) return false;

  try {
    const { speechRecognition } = await stt.checkPermissions();
    if (speechRecognition === "granted") return true;

    const result = await stt.requestPermissions();
    return result.speechRecognition === "granted";
  } catch {
    return false;
  }
}

export async function iniciarEscuchaNativa(
  onResultado: (texto: string) => void,
  onError?: () => void
): Promise<void> {
  const cap = (window as any).Capacitor;
  const stt = cap?.Plugins?.SpeechRecognition;

  if (!stt) {
    console.warn("[voz] Plugin STT no disponible");
    onError?.();
    return;
  }

  try {
    const tienePermiso = await pedirPermisoMicrofono();
    if (!tienePermiso) {
      console.warn("[voz] Permiso de micrófono denegado");
      onError?.();
      return;
    }

    await stt.start({
      language: "es-419",
      maxResults: 1,
      prompt: "Habla con QUETAI",
      partialResults: false,
      popup: false,
    });

    // Escuchar el resultado
    const handler = stt.addListener("partialResults", (data: any) => {
      const texto = data?.matches?.[0];
      if (texto) {
        handler.remove();
        onResultado(texto);
      }
    });

    // También manejar resultado final
    const handlerFinal = stt.addListener("listeningState", (data: any) => {
      if (data?.status === "stopped") {
        handlerFinal.remove();
        // Si llegamos aquí sin resultado, no hacer nada
      }
    });

  } catch (err) {
    console.error("[voz] Error STT nativo:", err);
    onError?.();
  }
}

export async function detenerEscuchaNativa(): Promise<void> {
  const cap = (window as any).Capacitor;
  const stt = cap?.Plugins?.SpeechRecognition;
  if (stt) {
    await stt.stop?.().catch(() => {});
  }
}
