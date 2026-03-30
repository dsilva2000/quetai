import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/queryClient";
import { Mic, MicOff, Send, Volume2, VolumeX, RotateCcw, Sun, Moon, Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import InstallGuide from "@/components/InstallGuide";
import RecordatorioBubble from "@/components/RecordatorioBubble";
import { useFCM } from "@/hooks/useFCM";
import { isCapacitorApp, hablarNativo, iniciarEscuchaNativa, detenerEscuchaNativa } from "@/hooks/useVozNativa";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Mensaje { id: number; rol: string; contenido: string; orden: number; }
interface Medicamento { id: number; nombre: string; horario: string; }

// ─── Session ID via URL hash ───────────────────────────────────────────────────
const LS_KEY = "quetai_sid";

function getOrCreateSessionId(): string {
  // 1. Prioridad: sid en la URL (para links guardados o compartidos)
  const hash = window.location.hash;
  const hashSearch = hash.includes("?") ? hash.slice(hash.indexOf("?")) : "";
  const params = new URLSearchParams(hashSearch);
  let sid = params.get("sid");

  if (sid) {
    // Si viene en URL, sincronizar localStorage
    localStorage.setItem(LS_KEY, sid);
  } else {
    // 2. Intentar recuperar del localStorage (misma sesión al volver)
    sid = localStorage.getItem(LS_KEY);
  }

  if (!sid) {
    // 3. Nuevo usuario: crear ID, guardarlo en ambos lugares
    sid = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(LS_KEY, sid);
  }

  // Siempre mantener la URL actualizada con el sid
  if (!params.get("sid")) {
    const newHash = hash.includes("?") ? `${hash}&sid=${sid}` : `${hash || "#/"}?sid=${sid}`;
    window.history.replaceState({}, "", newHash);
  }

  return sid;
}

// ─── Logo QUETAI ───────────────────────────────────────────────────────────────
function QuetaiLogo({ size = 48 }: { size?: number }) {
  return (
    <img
      src="./icon-192.png"
      width={size}
      height={size}
      alt="QUETAI"
      style={{ borderRadius: size * 0.22, objectFit: "cover" }}
    />
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────
export default function ChatPage() {
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [fase, setFase] = useState<"cargando" | "onboarding" | "chat">("cargando");
  const [nombre, setNombre] = useState("");
  const [inputNombre, setInputNombre] = useState("");
  const [inputTelefono, setInputTelefono] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [modoOscuro, setModoOscuro] = useState(false);

  // ── Voz ──────────────────────────────────────────────────────────────────────
  const [modoVoz, setModoVoz] = useState(false);       // modo manos libres activo
  const [escuchando, setEscuchando] = useState(false); // micrófono abierto
  const [hablando, setHablando] = useState(false);     // QUETAI está hablando (TTS)
  const [vozSilenciada, setVozSilenciada] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // ── Push notifications ───────────────────────────────────────────────────────
  const { status: pushStatus, suscrito, suscribirse, desuscribirse } = usePushNotifications(sessionId);
  // FCM nativo para APK Android
  useFCM(sessionId);
  const [bannerPush, setBannerPush] = useState(true); // mostrar banner de permiso
  const [mostrarGuia, setMostrarGuia] = useState(false); // mostrar tutorial instalación Android

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", modoOscuro);
  }, [modoOscuro]);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes, streamingText]);

  // Cargar sesión
  useEffect(() => {
    fetch(`${API_BASE}/api/session/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.existe) {
          setNombre(data.usuario.nombre);
          setMedicamentos(data.medicamentos || []);
          return fetch(`${API_BASE}/api/session/${sessionId}/mensajes`)
            .then(r => r.json())
            .then(msgs => {
              if (Array.isArray(msgs) && msgs.length > 0) {
                setMensajes(msgs);
                setFase("chat");
              } else {
                setFase("chat");
                enviarSaludoInicial(data.usuario.nombre);
              }
            });
        } else {
          setFase("onboarding");
        }
      })
      .catch(() => setFase("onboarding"));
  }, [sessionId]);

  const enviarSaludoInicial = useCallback((nombreUsuario: string) => {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
    const primer = nombreUsuario.split(" ")[0];
    const texto = `${saludo}, ${primer}. 😊 Soy QUETAI, ¡qué gusto tenerte aquí! ¿Cómo estás hoy?`;
    const msg: Mensaje = { id: Date.now(), rol: "assistant", contenido: texto, orden: 0 };
    setMensajes([msg]);
  }, []);

  // ── TTS — APK: motor nativo Android / Browser: ElevenLabs + fallback ────────
  const ELEVEN_KEY = "131d240b7c0b6c5e5d7b079f97dbd5bcb8615a3a73a3880d846eddd21187a9ea";
  const ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL";

  const hablarTexto = useCallback(async (texto: string) => {
    if (vozSilenciada) return;
    const textoLimpio = texto.replace(/[*_~`]/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2600}-\u{27BF}]/gu, "").trim();
    if (!textoLimpio) return;
    setHablando(true);

    // ── APK: TTS nativo de Android ────────────────────────────────────
    if (isCapacitorApp()) {
      await hablarNativo(textoLimpio, () => {
        setHablando(false);
        if (modoVoz) iniciarEscucha();
      });
      return;
    }

    // ── Browser: ElevenLabs con fallback a SpeechSynthesis ──────────────
    const usarNavegador = () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(textoLimpio);
        utt.lang = "es-419"; utt.rate = 0.88; utt.pitch = 1.05;
        const voices = window.speechSynthesis.getVoices();
        const esVoice = voices.find(v => v.lang.startsWith("es") && v.name.toLowerCase().includes("female"))
          || voices.find(v => v.lang.startsWith("es"));
        if (esVoice) utt.voice = esVoice;
        utt.onend = () => { setHablando(false); if (modoVoz) iniciarEscucha(); };
        utt.onerror = () => { setHablando(false); if (modoVoz) iniciarEscucha(); };
        window.speechSynthesis.speak(utt);
      } else { setHablando(false); if (modoVoz) iniciarEscucha(); }
    };

    try {
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`,
        {
          method: "POST",
          headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textoLimpio,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.55, similarity_boost: 0.80, style: 0.10, use_speaker_boost: true },
          }),
        }
      );
      if (!resp.ok) { usarNavegador(); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setHablando(false); URL.revokeObjectURL(url); if (modoVoz) iniciarEscucha(); };
      audio.onerror = () => { setHablando(false); usarNavegador(); };
      await audio.play();
    } catch {
      usarNavegador();
    }
  }, [vozSilenciada, modoVoz]);

  // ── STT con Web Speech API ────────────────────────────────────────────────────
  const iniciarEscucha = useCallback(() => {
    if (hablando) return;

    // APK: usar STT nativo de Android
    if (isCapacitorApp()) {
      setEscuchando(true);
      iniciarEscuchaNativa(
        (texto) => {
          setEscuchando(false);
          if (texto) enviarMensaje(texto);
        },
        () => setEscuchando(false)
      );
      return;
    }

    // Browser: Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Tu navegador no soporta voz. Usa Chrome.", variant: "destructive" });
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "es-419";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setEscuchando(true);
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    rec.onresult = (e: any) => {
      const texto = e.results[0][0].transcript.trim();
      if (texto) enviarMensaje(texto);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [hablando]);

  const detenerEscucha = useCallback(() => {
    if (isCapacitorApp()) {
      detenerEscuchaNativa();
      setEscuchando(false);
      return;
    }
    recognitionRef.current?.stop();
    setEscuchando(false);
  }, []);

  const toggleModoVoz = useCallback(() => {
    if (modoVoz) {
      detenerEscucha();
      if (audioRef.current) audioRef.current.pause();
      setHablando(false);
      setModoVoz(false);
    } else {
      setModoVoz(true);
      toast({ title: "🎙️ Modo voz activado", description: "QUETAI te escucha cuando termina de hablar." });
      iniciarEscucha();
    }
  }, [modoVoz, detenerEscucha, iniciarEscucha]);

  // ── Registro ─────────────────────────────────────────────────────────────────
  const registrar = async () => {
    const n = inputNombre.trim();
    if (!n || n.length < 2) {
      toast({ title: "¿Cómo te llamas? Escribe tu nombre.", variant: "destructive" });
      return;
    }
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: n }),
    });
    if (res.ok) {
      // Guardar teléfono si se proporcionó (para recordatorios por WhatsApp)
      const tel = inputTelefono.trim().replace(/[^+\d]/g, "");
      if (tel.length >= 7) {
        fetch(`${API_BASE}/api/session/${sessionId}/telefono`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telefono: tel }),
        }).catch(() => {});
      }
      setNombre(n);
      setFase("chat");
      enviarSaludoInicial(n);
    }
  };

  // ── Enviar mensaje ────────────────────────────────────────────────────────────
  const enviarMensaje = useCallback(async (texto: string) => {
    if (!texto.trim() || streaming) return;
    setInput("");
    setStreaming(true);
    setStreamingText("");

    const msgUser: Mensaje = { id: Date.now(), rol: "user", contenido: texto.trim(), orden: mensajes.length };
    setMensajes(prev => [...prev, msgUser]);

    try {
      const response = await fetch(`${API_BASE}/api/session/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto.trim() }),
      });
      if (!response.ok || !response.body) throw new Error("Error de conexión");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acum = "";
      let medsActualizados: Medicamento[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) { acum += data.token; setStreamingText(acum); }
            if (data.done) { medsActualizados = data.medicamentos || null; }
          } catch { /* ignorar */ }
        }
      }

      const msgBot: Mensaje = { id: Date.now() + 1, rol: "assistant", contenido: acum, orden: mensajes.length + 1 };
      setMensajes(prev => [...prev, msgBot]);
      setStreamingText("");
      if (medsActualizados) setMedicamentos(medsActualizados);

      // Leer en voz alta si modo voz o voz no silenciada
      if (acum && !vozSilenciada) hablarTexto(acum);

    } catch {
      const errMsg = "Perdona, tuve un problemita. ¿Me repites eso?";
      setMensajes(prev => [...prev, { id: Date.now() + 1, rol: "assistant", contenido: errMsg, orden: mensajes.length + 1 }]);
      if (!vozSilenciada) hablarTexto(errMsg);
    } finally {
      setStreaming(false);
      if (!modoVoz) setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [streaming, mensajes, sessionId, vozSilenciada, modoVoz, hablarTexto]);

  const enviar = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) enviarMensaje(input.trim());
  };

  const resetConversacion = async () => {
    await fetch(`${API_BASE}/api/session/${sessionId}/mensajes`, { method: "DELETE" });
    setMensajes([]);
    enviarSaludoInicial(nombre);
  };

  // ── Render: Cargando ─────────────────────────────────────────────────────────
  if (fase === "cargando") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 bg-background">
        <div className="w-24 h-24 rounded-3xl bg-primary/15 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary animate-pulse" />
        </div>
        <p className="text-2xl text-muted-foreground font-medium">Cargando QUETAI...</p>
      </div>
    );
  }

  // ── Render: Onboarding ───────────────────────────────────────────────────────
  if (fase === "onboarding") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 py-10">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center space-y-4">
            <div className="mx-auto w-28 h-28 rounded-3xl bg-primary/15 flex items-center justify-center shadow-sm">
              <QuetaiLogo size={64} />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground tracking-tight">QUETAI</h1>
              <p className="text-xl text-muted-foreground mt-1">Tu amigo de cada día · <span className="text-base opacity-60">v4.4</span></p>
            </div>
          </div>

          {/* Tarjeta */}
          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border space-y-6">
            <p className="text-foreground text-center text-xl leading-relaxed">
              ¡Hola! Me da mucho gusto que estés aquí. 😊<br />
              <span className="text-muted-foreground text-lg mt-2 block">¿Cómo te llamas?</span>
            </p>
            <input
              type="text"
              placeholder="Ej: María, Daniel, Rosa..."
              value={inputNombre}
              onChange={e => setInputNombre(e.target.value)}
              onKeyDown={e => e.key === "Enter" && registrar()}
              autoFocus
              autoComplete="given-name"
              className="w-full text-center text-2xl font-semibold h-[4.5rem] rounded-2xl border-2 border-border bg-input px-4 focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-muted-foreground/50"
            />

            <button
              onClick={registrar}
              className="w-full h-[4.5rem] rounded-2xl text-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md"
            >
              ¡Empezar! 😊
            </button>
            <p className="text-base text-muted-foreground text-center leading-relaxed">
              Solo guardamos tu nombre para que QUETAI te llame con cariño.
            </p>
          </div>


        </div>
      </div>
    );
  }

  // ── Render: Chat ─────────────────────────────────────────────────────────────
  const primerNombre = nombre.split(" ")[0];

  return (
    <div className="flex flex-col h-[100dvh] bg-background max-w-2xl mx-auto">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <QuetaiLogo size={28} />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">QUETAI</div>
            <div className="text-sm text-muted-foreground leading-tight">
              {modoVoz && escuchando ? "🎙️ Escuchando…" : modoVoz && hablando ? "🔊 Hablando…" : `Hola, ${primerNombre}`}
            </div>
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2">
          {/* Notificaciones */}
          {pushStatus !== "unsupported" && (
            <button
              onClick={suscrito ? desuscribirse : () => setMostrarGuia(true)}
              title={suscrito ? "Desactivar recordatorios" : "Instalar app para recordatorios"}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                suscrito ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {suscrito ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
          )}
          {/* Silenciar voz */}
          <button
            onClick={() => setVozSilenciada(v => !v)}
            title={vozSilenciada ? "Activar voz" : "Silenciar"}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {vozSilenciada ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          {/* Nueva conversación */}
          <button
            onClick={resetConversacion}
            title="Nueva conversación"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          {/* Modo oscuro */}
          <button
            onClick={() => setModoOscuro(v => !v)}
            title="Cambiar tema"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {modoOscuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ── Banner notificaciones push ── */}
      {fase === "chat" && bannerPush && pushStatus === "prompt" && (
        <div className="mx-4 mt-3 mb-1 rounded-2xl bg-primary/10 border border-primary/20 p-4 flex items-start gap-3 shrink-0">
          <Bell className="w-6 h-6 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-lg text-foreground leading-snug">
              ¿Quieres recibir recordatorios de tus pastillas? 💊
            </p>
            <p className="text-base text-muted-foreground mt-1">
              Te avisamos aunque el celular esté guardado o la pantalla apagada.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={async () => {
                  // Intentar suscripción push directa
                  const ok = await suscribirse();
                  if (ok) {
                    setBannerPush(false);
                  } else {
                    // Si falla (browser cerrado no soporta push sin instalar), mostrar guía
                    setMostrarGuia(true);
                  }
                }}
                className="px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all active:scale-95"
              >
                Sí, avísame 🔔
              </button>
              <button
                onClick={() => setMostrarGuia(true)}
                className="px-5 py-3 rounded-2xl border-2 border-primary/30 text-base font-semibold text-primary hover:bg-primary/10 transition-all active:scale-95"
              >
                ¿Cómo instalar? 📲
              </button>
              <button
                onClick={() => setBannerPush(false)}
                className="px-5 py-3 rounded-2xl border border-border text-base text-muted-foreground hover:bg-muted transition-all"
              >
                Ahora no
              </button>
            </div>
          </div>
          <button onClick={() => setBannerPush(false)} className="text-muted-foreground hover:text-foreground shrink-0">
            <BellOff className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Mensajes ── */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {mensajes.map(m => (
          <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
            {m.rol === "assistant" && (
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mb-1">
                <QuetaiLogo size={20} />
              </div>
            )}
            <div className={`max-w-[82%] px-5 py-3.5 text-lg leading-relaxed rounded-3xl ${
              m.rol === "user"
                ? "bg-primary text-primary-foreground rounded-br-lg"
                : "bg-card border border-border text-foreground rounded-bl-lg"
            }`}>
              {m.contenido}
            </div>
          </div>
        ))}

        {/* Streaming */}
        {streaming && (
          <div className="flex justify-start items-end gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mb-1">
              <QuetaiLogo size={20} />
            </div>
            <div className="bg-card border border-border rounded-3xl rounded-bl-lg px-5 py-3.5 text-lg max-w-[82%] leading-relaxed">
              {streamingText || (
                <span className="flex gap-1.5 items-center h-6">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modo VOZ: Botón grande central ── */}
      {modoVoz ? (
        <div className="px-4 pb-6 pt-3 border-t border-border bg-card/60 shrink-0">
          <div className="flex flex-col items-center gap-4">
            {/* Botón grande de micrófono */}
            <button
              onClick={escuchando ? detenerEscucha : iniciarEscucha}
              disabled={hablando || streaming}
              className={`w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 text-white font-bold text-base shadow-lg transition-all active:scale-95 ${
                escuchando
                  ? "bg-red-500 hover:bg-red-600 animate-pulse"
                  : hablando || streaming
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90"
              }`}
            >
              {escuchando ? (
                <>
                  <MicOff className="w-10 h-10" />
                  <span className="text-sm">Parar</span>
                </>
              ) : hablando ? (
                <>
                  <Volume2 className="w-10 h-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Hablando…</span>
                </>
              ) : (
                <>
                  <Mic className="w-10 h-10" />
                  <span className="text-sm">Hablar</span>
                </>
              )}
            </button>

            <p className="text-base text-muted-foreground text-center">
              {escuchando ? "Te estoy escuchando… habla cuando quieras" :
               hablando ? "QUETAI está respondiendo…" :
               "Toca el botón para hablarle a QUETAI"}
            </p>

            {/* Salir de modo voz */}
            <button
              onClick={toggleModoVoz}
              className="px-6 py-2.5 rounded-full border border-border text-base text-muted-foreground hover:text-foreground hover:border-foreground transition-all"
            >
              Volver a escribir
            </button>
          </div>
        </div>
      ) : (
        /* ── Modo TEXTO ── */
        <div className="px-4 pb-5 pt-3 border-t border-border bg-card/60 shrink-0">
          <form onSubmit={enviar} className="flex gap-2 items-end">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={streaming ? "QUETAI está respondiendo…" : `Escribe aquí, ${primerNombre}…`}
              disabled={streaming}
              className="flex-1 rounded-2xl border-2 border-border bg-input px-4 py-4 text-lg focus:outline-none focus:ring-4 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {/* Botón enviar */}
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 active:scale-95 transition-all shrink-0"
            >
              <Send className="w-6 h-6" />
            </button>
            {/* Botón activar voz */}
            <button
              type="button"
              onClick={toggleModoVoz}
              title="Cambiar a modo de voz"
              className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all shrink-0"
            >
              <Mic className="w-6 h-6" />
            </button>
          </form>

          {/* Footer legal */}
          <div className="mt-3 space-y-1.5 text-center">
            <p className="text-xs text-muted-foreground/70 leading-relaxed px-2">
              Este chat de IA es solo orientación general y no sustituye consejo médico, psicológico ni legal.
              En emergencias, contacta servicios de urgencias o un familiar. Al usar esta app aceptas estos términos.
            </p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 flex-wrap">
              <span>Hecho con ❤️ en Latinoamérica ·</span>
              <a href="https://www.quetai.tech" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:text-foreground transition-colors">QUETAI</a>
              <span>es un servicio de</span>
              <a href="https://www.mancolab.com" target="_blank" rel="noopener noreferrer"
                className="font-semibold hover:text-foreground transition-colors">MancoLab</a>
              <span>© 2026</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Bubble de recordatorio (polling cuando app está abierta) ── */}
      {fase === "chat" && (
        <RecordatorioBubble
          sessionId={sessionId}
          onHablar={hablarTexto}
        />
      )}

      {/* ── Tutorial de instalación Android ── */}
      {mostrarGuia && (
        <InstallGuide
          onClose={() => setMostrarGuia(false)}
          onInstalado={() => {
            setMostrarGuia(false);
            setBannerPush(false);
            suscribirse();
          }}
        />
      )}
    </div>
  );
}