import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/queryClient";
import {
  Send, Pill, Moon, Sun, Trash2, RotateCcw, ShieldCheck
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Mensaje { id: number; rol: string; contenido: string; orden: number; }
interface Medicamento { id: number; nombre: string; horario: string; }

// ─── Session ID persistente via URL hash param ─────────────────────────────────
function getOrCreateSessionId(): string {
  // Leer/crear session desde el hash de la URL: #/?sid=xxxx
  const hash = window.location.hash; // e.g. "#/?sid=abc123"
  const hashSearch = hash.includes("?") ? hash.slice(hash.indexOf("?")) : "";
  const params = new URLSearchParams(hashSearch);
  let sid = params.get("sid");
  if (!sid) {
    sid = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // Guardar en el hash sin recargar
    const newHash = hash.includes("?") ? `${hash}&sid=${sid}` : `${hash || "#/"}?sid=${sid}`;
    window.history.replaceState({}, "", newHash);
  }
  return sid;
}

// ─── Componente principal ───────────────────────────────────────────────────────
export default function ChatPage() {
  const [sessionId] = useState(() => getOrCreateSessionId());
  const [fase, setFase] = useState<"cargando" | "onboarding" | "chat">("cargando");
  const [nombre, setNombre] = useState("");
  const [inputNombre, setInputNombre] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [modoOscuro, setModoOscuro] = useState(false);
  const [mostrarMeds, setMostrarMeds] = useState(false);
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

  // Cargar sesión al inicio
  useEffect(() => {
    fetch(`${API_BASE}/api/session/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.existe) {
          setNombre(data.usuario.nombre);
          setMedicamentos(data.medicamentos || []);
          // Cargar historial
          return fetch(`${API_BASE}/api/session/${sessionId}/mensajes`)
            .then((r) => r.json())
            .then((msgs) => {
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
    const msg: Mensaje = {
      id: Date.now(),
      rol: "assistant",
      contenido: `${saludo}, ${primer}. Soy QUETAI, tu compañero de cada día. ¿Cómo te sientes hoy?`,
      orden: 0,
    };
    setMensajes([msg]);
  }, []);

  // Registrar usuario en onboarding
  const registrar = async () => {
    const n = inputNombre.trim();
    if (!n || n.split(" ").length < 2) {
      toast({ title: "Por favor escribe tu nombre y apellido.", variant: "destructive" });
      return;
    }
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: n }),
    });
    if (res.ok) {
      setNombre(n);
      setFase("chat");
      enviarSaludoInicial(n);
    }
  };

  // Enviar mensaje
  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const texto = input.trim();
    if (!texto || streaming) return;
    setInput("");
    setStreaming(true);
    setStreamingText("");

    const msgUser: Mensaje = { id: Date.now(), rol: "user", contenido: texto, orden: mensajes.length };
    setMensajes((prev) => [...prev, msgUser]);

    try {
      const response = await fetch(`${API_BASE}/api/session/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
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
      setMensajes((prev) => [...prev, msgBot]);
      setStreamingText("");
      if (medsActualizados) setMedicamentos(medsActualizados);
    } catch {
      const err: Mensaje = { id: Date.now() + 1, rol: "assistant", contenido: "Lo siento, tuve un problemita. ¿Puedes repetirme eso?", orden: mensajes.length + 1 };
      setMensajes((prev) => [...prev, err]);
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const resetConversacion = async () => {
    await fetch(`${API_BASE}/api/session/${sessionId}/mensajes`, { method: "DELETE" });
    setMensajes([]);
    enviarSaludoInicial(nombre);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (fase === "cargando") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary animate-pulse" />
        </div>
        <p className="text-muted-foreground">Cargando QUETAI...</p>
      </div>
    );
  }

  if (fase === "onboarding") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center">
              <svg viewBox="0 0 40 40" className="w-12 h-12" fill="none" aria-label="QUETAI">
                <circle cx="20" cy="20" r="18" fill="hsl(152,28%,42%)" opacity="0.15"/>
                <path d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30 C23 30 25.5 28.5 27 26.5 L30 29 L29 22 L22 23 L24.5 25.2 C23.5 26.4 21.9 27.2 20 27.2 C15.6 27.2 12.8 23.8 12.8 20 C12.8 16.2 15.6 12.8 20 12.8 C22.8 12.8 25.1 14.2 26.4 16.5 L29 15 C27.1 11.8 23.8 10 20 10 Z" fill="hsl(152,28%,42%)"/>
                <circle cx="20" cy="20" r="2.5" fill="hsl(28,60%,55%)"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">QUETAI</h1>
              <p className="text-muted-foreground text-sm">Tu compañero de cada día</p>
            </div>
          </div>

          {/* Formulario */}
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border space-y-4">
            <p className="text-foreground text-center leading-relaxed">
              Hola, me alegra que estés aquí.<br />
              Para acompañarte bien, ¿me dices tu <strong>nombre completo</strong>?
            </p>
            <Input
              data-testid="input-nombre"
              placeholder="Ej: María González"
              value={inputNombre}
              onChange={(e) => setInputNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && registrar()}
              className="text-center text-base h-12 rounded-xl"
              autoFocus
            />
            <Button
              data-testid="button-comenzar"
              onClick={registrar}
              className="w-full h-12 rounded-xl text-base font-semibold bg-primary hover:bg-primary/90"
            >
              Comenzar con QUETAI
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Tu nombre se guarda solo para que QUETAI pueda hablarte con cariño.
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground transition-colors">
              Panel de administración
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista de chat ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-background max-w-2xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <svg viewBox="0 0 40 40" className="w-6 h-6" fill="none">
              <circle cx="20" cy="20" r="18" fill="hsl(152,28%,42%)" opacity="0.15"/>
              <path d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30 C23 30 25.5 28.5 27 26.5 L30 29 L29 22 L22 23 L24.5 25.2 C23.5 26.4 21.9 27.2 20 27.2 C15.6 27.2 12.8 23.8 12.8 20 C12.8 16.2 15.6 12.8 20 12.8 C22.8 12.8 25.1 14.2 26.4 16.5 L29 15 C27.1 11.8 23.8 10 20 10 Z" fill="hsl(152,28%,42%)"/>
              <circle cx="20" cy="20" r="2.5" fill="hsl(28,60%,55%)"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">QUETAI</div>
            <div className="text-xs text-muted-foreground leading-tight">Hola, {nombre.split(" ")[0]}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {medicamentos.length > 0 && (
            <Button
              data-testid="button-meds"
              variant="ghost" size="sm"
              onClick={() => setMostrarMeds(!mostrarMeds)}
              className="relative text-muted-foreground hover:text-foreground"
            >
              <Pill className="w-4 h-4" />
              <Badge className="absolute -top-1 -right-1 w-4 h-4 p-0 flex items-center justify-center text-xs bg-accent text-accent-foreground">
                {medicamentos.length}
              </Badge>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={resetConversacion} title="Nueva conversación"
            className="text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setModoOscuro(!modoOscuro)}
            className="text-muted-foreground hover:text-foreground">
            {modoOscuro ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Panel medicamentos */}
      {mostrarMeds && (
        <div className="bg-card border-b border-border px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Medicamentos guardados
          </p>
          {medicamentos.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Pill className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">{m.nombre}</span>
                <span className="text-muted-foreground">a las {m.horario}</span>
              </span>
              <button
                onClick={async () => {
                  await fetch(`${API_BASE}/api/session/${sessionId}/medicamentos/${m.id}`, { method: "DELETE" });
                  setMedicamentos((prev) => prev.filter((x) => x.id !== m.id));
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mensajes */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
            {m.rol === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                <svg viewBox="0 0 40 40" className="w-4 h-4" fill="none">
                  <path d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30 C23 30 25.5 28.5 27 26.5 L30 29 L29 22 L22 23 L24.5 25.2 C23.5 26.4 21.9 27.2 20 27.2 C15.6 27.2 12.8 23.8 12.8 20 C12.8 16.2 15.6 12.8 20 12.8 C22.8 12.8 25.1 14.2 26.4 16.5 L29 15 C27.1 11.8 23.8 10 20 10 Z" fill="hsl(152,28%,42%)"/>
                </svg>
              </div>
            )}
            <div className={`max-w-[78%] px-4 py-2.5 text-sm leading-relaxed ${
              m.rol === "user" ? "bubble-user" : "bubble-assistant"
            }`}>
              {m.contenido}
            </div>
          </div>
        ))}

        {/* Burbuja de streaming */}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
              <svg viewBox="0 0 40 40" className="w-4 h-4" fill="none">
                <path d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30 C23 30 25.5 28.5 27 26.5 L30 29 L29 22 L22 23 L24.5 25.2 C23.5 26.4 21.9 27.2 20 27.2 C15.6 27.2 12.8 23.8 12.8 20 C12.8 16.2 15.6 12.8 20 12.8 C22.8 12.8 25.1 14.2 26.4 16.5 L29 15 C27.1 11.8 23.8 10 20 10 Z" fill="hsl(152,28%,42%)"/>
              </svg>
            </div>
            <div className="bubble-assistant max-w-[78%] px-4 py-2.5 text-sm leading-relaxed">
              {streamingText || (
                <span className="flex gap-1 items-center h-5">
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-border bg-card/60 backdrop-blur-sm">
        <form onSubmit={enviar} className="flex gap-2">
          <Input
            ref={inputRef}
            data-testid="input-mensaje"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Escríbele a QUETAI, ${nombre.split(" ")[0]}...`}
            disabled={streaming}
            className="flex-1 rounded-xl h-11 text-sm"
          />
          <Button
            data-testid="button-enviar"
            type="submit"
            disabled={!input.trim() || streaming}
            className="rounded-xl h-11 px-4 bg-primary hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer"
            className="hover:text-foreground transition-colors">
            Creado con Perplexity Computer
          </a>
          {" · "}
          <Link href="/admin" className="hover:text-foreground transition-colors">
            <ShieldCheck className="inline w-3 h-3 mr-0.5" />Admin
          </Link>
        </p>
      </div>
    </div>
  );
}
