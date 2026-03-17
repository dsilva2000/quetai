import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import PerplexityAttribution from "@/components/PerplexityAttribution";

// Generar session ID único en memoria (no usa sessionStorage)
let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = crypto.randomUUID();
  }
  return _sessionId;
}

type Mensaje = {
  id: number;
  rol: "user" | "assistant";
  contenido: string;
  orden: number;
};

type Medicamento = {
  id: number;
  nombre: string;
  horario: string;
  activo: boolean;
};

// Logo SVG de QUETAI
function QuetaiLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="QUETAI logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Círculo corazón / mano */}
      <circle cx="20" cy="20" r="18" fill="currentColor" opacity="0.12" />
      {/* Corazón estilizado */}
      <path
        d="M20 28s-9-5.5-9-11.5A5.5 5.5 0 0 1 20 14.1 5.5 5.5 0 0 1 29 16.5C29 22.5 20 28 20 28z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Estrellita arriba */}
      <circle cx="20" cy="10" r="1.5" fill="currentColor" />
      <circle cx="25" cy="12" r="1" fill="currentColor" opacity="0.6" />
      <circle cx="15" cy="12" r="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

// Renderizar texto con markdown básico (bold, saltos de línea)
function RenderTexto({ texto }: { texto: string }) {
  // Convertir **texto** en bold y \n en saltos
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {partes.map((parte, i) => {
        if (parte.startsWith("**") && parte.endsWith("**")) {
          return <strong key={i}>{parte.slice(2, -2)}</strong>;
        }
        return parte.split("\n").map((linea, j, arr) => (
          j < arr.length - 1
            ? <span key={`${i}-${j}`}>{linea}<br /></span>
            : <span key={`${i}-${j}`}>{linea}</span>
        ));
      })}
    </>
  );
}

// Componente de burbuja de mensaje
function MensajeBurbuja({ mensaje }: { mensaje: Mensaje }) {
  const isUser = mensaje.rol === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} msg-enter`}
      data-testid={`mensaje-${mensaje.id}`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1">
          <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
            <path d="M20 28s-9-5.5-9-11.5A5.5 5.5 0 0 1 20 14.1 5.5 5.5 0 0 1 29 16.5C29 22.5 20 28 20 28z" fill="hsl(152,38%,36%)" />
          </svg>
        </div>
      )}
      <div className={isUser ? "bubble-user" : "bubble-assistant"}>
        <RenderTexto texto={mensaje.contenido} />
      </div>
    </div>
  );
}

// Dots de typing
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-2">
        <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
          <path d="M20 28s-9-5.5-9-11.5A5.5 5.5 0 0 1 20 14.1 5.5 5.5 0 0 1 29 16.5C29 22.5 20 28 20 28z" fill="hsl(152,38%,36%)" />
        </svg>
      </div>
      <div className="bubble-assistant flex items-center gap-1 py-3 px-4">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

// Panel lateral de medicamentos
function MedicamentosPanel({ medicamentos }: { medicamentos: Medicamento[] }) {
  if (medicamentos.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-40">
          <path d="m7.5 21 3-3m0 0 3-3m-3 3 3 3m-3-3-3-3M6.75 4.5l-3 3 12 12 3-3-12-12z"/>
        </svg>
        <p>Cuéntale a QUETAI qué<br/>medicamentos tomas.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {medicamentos.map(m => (
        <li key={m.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-secondary/60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0 text-primary">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
          </svg>
          <div>
            <p className="font-semibold text-sm leading-tight">{m.nombre}</p>
            <p className="text-xs text-muted-foreground">{m.horario}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Pantalla de onboarding — pide nombre completo
function OnboardingScreen({ onNombreGuardado }: { onNombreGuardado: (nombre: string) => void }) {
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const sessionId = getSessionId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = nombre.trim();
    if (n.split(" ").length < 2) {
      alert("Por favor ingresa tu nombre completo (nombre y apellido).");
      return;
    }
    setCargando(true);
    try {
      await apiRequest("POST", `/api/session/${sessionId}/registro`, { nombreCompleto: n });
      onNombreGuardado(n);
    } catch {
      alert("Hubo un error. Por favor intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Logo y título */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <QuetaiLogo size={48} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">QUETAI</h1>
            <p className="text-muted-foreground text-sm mt-1">Tu compañero de cada día</p>
          </div>
        </div>

        {/* Card de bienvenida */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 text-left space-y-4">
          <p className="text-foreground font-medium text-base leading-relaxed">
            Hola, me alegra que estés aquí. Para poder acompañarte mejor, ¿me dices tu nombre completo?
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              data-testid="input-nombre"
              type="text"
              placeholder="Ej: María Gonzáles"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="text-base h-12 rounded-xl"
              autoFocus
              required
            />
            <Button
              data-testid="boton-comenzar"
              type="submit"
              className="w-full h-12 text-base rounded-xl font-semibold"
              disabled={cargando || nombre.trim().length < 4}
            >
              {cargando ? "Guardando..." : "Comenzar con QUETAI"}
            </Button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground px-4">
          Tu nombre se guarda solo para que QUETAI pueda hablarte con cariño.
        </p>
      </div>
      <div className="mt-8">
        <PerplexityAttribution />
      </div>
    </div>
  );
}

// Pantalla principal de chat
export default function ChatPage() {
  const sessionId = getSessionId();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [modoOscuro, setModoOscuro] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [panelAbierto, setPanelAbierto] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", modoOscuro ? "dark" : "light");
  }, [modoOscuro]);

  // Cargar sesión al inicio
  useEffect(() => {
    fetch(`${API_BASE}/api/session/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.existe) {
          setNombreUsuario(data.usuario.nombreCompleto);
          setMedicamentos(data.medicamentos || []);
        }
      });
  }, [sessionId]);

  // Cargar historial de mensajes
  useEffect(() => {
    if (!nombreUsuario) return;
    fetch(`${API_BASE}/api/session/${sessionId}/mensajes`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMensajes(data);
        } else {
          // Primer saludo automático
          enviarSaludoInicial();
        }
      });
  }, [nombreUsuario]);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes, streamingText, streaming]);

  const enviarSaludoInicial = useCallback(async () => {
    // Detectar momento del día
    const hora = new Date().getHours();
    let saludo = "Buenos días";
    if (hora >= 12 && hora < 18) saludo = "Buenas tardes";
    else if (hora >= 18) saludo = "Buenas noches";

    const primerNombre = nombreUsuario?.split(" ")[0] ?? "";
    const mensajeSaludo = `${saludo}, ${primerNombre}. Soy QUETAI, tu compañero. ¿Cómo te sientes hoy?`;

    const nuevoMensaje: Mensaje = {
      id: Date.now(),
      rol: "assistant",
      contenido: mensajeSaludo,
      orden: 0,
    };
    setMensajes([nuevoMensaje]);

    // Guardar en backend
    await fetch(`${API_BASE}/api/session/${sessionId}/mensajes`);
    // El saludo inicial se enviará como primer mensaje real del asistente
  }, [nombreUsuario, sessionId]);

  const enviarMensaje = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const texto = input.trim();
    if (!texto || streaming) return;

    setInput("");
    setStreaming(true);
    setStreamingText("");

    // Agregar mensaje del usuario localmente
    const msgUsuario: Mensaje = {
      id: Date.now(),
      rol: "user",
      contenido: texto,
      orden: mensajes.length,
    };
    setMensajes(prev => [...prev, msgUsuario]);

    try {
      const response = await fetch(`${API_BASE}/api/session/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
      });

      if (!response.ok || !response.body) throw new Error("Error de conexión");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textoAcumulado = "";
      let medsActualizados: Medicamento[] | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              textoAcumulado += data.token;
              setStreamingText(textoAcumulado);
            }
            if (data.medicamentos) {
              medsActualizados = data.medicamentos;
            }
            if (data.error) {
              toast({ title: "Error", description: data.error, variant: "destructive" });
            }
          } catch {}
        }
      }

      // Guardar mensaje del asistente
      if (textoAcumulado) {
        const msgAsistente: Mensaje = {
          id: Date.now() + 1,
          rol: "assistant",
          contenido: textoAcumulado,
          orden: mensajes.length + 1,
        };
        setMensajes(prev => [...prev, msgAsistente]);
      }

      if (medsActualizados) {
        setMedicamentos(medsActualizados);
      }
    } catch (err) {
      toast({
        title: "No pude conectarme",
        description: "Por favor intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setStreaming(false);
      setStreamingText("");
      inputRef.current?.focus();
    }
  };

  const handleNombreGuardado = (nombre: string) => {
    setNombreUsuario(nombre);
  };

  // Si no hay nombre → pantalla de onboarding
  if (!nombreUsuario) {
    return <OnboardingScreen onNombreGuardado={handleNombreGuardado} />;
  }

  const primerNombre = nombreUsuario.split(" ")[0];

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="text-primary">
              <QuetaiLogo size={30} />
            </div>
            <div>
              <span className="font-bold text-base text-foreground tracking-tight">QUETAI</span>
              <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">· Hola, {primerNombre}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Panel de medicamentos toggle */}
            <button
              data-testid="btn-medicamentos"
              onClick={() => setPanelAbierto(p => !p)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              title="Ver medicamentos"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m7.5 21 3-3m0 0 3-3m-3 3 3 3m-3-3-3-3M6.75 4.5l-3 3 12 12 3-3-12-12z"/>
              </svg>
              <span className="hidden sm:inline">Medicamentos</span>
              {medicamentos.length > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {medicamentos.length}
                </span>
              )}
            </button>

            {/* Toggle modo oscuro */}
            <button
              data-theme-toggle
              onClick={() => setModoOscuro(m => !m)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              aria-label="Cambiar tema"
            >
              {modoOscuro ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Layout principal */}
      <div className="flex-1 max-w-4xl mx-auto w-full flex gap-0">

        {/* Panel lateral de medicamentos (mobile: overlay, desktop: sidebar) */}
        {panelAbierto && (
          <aside className="fixed inset-0 z-20 md:relative md:inset-auto md:z-auto flex">
            {/* Overlay mobile */}
            <div
              className="flex-1 bg-black/30 md:hidden"
              onClick={() => setPanelAbierto(false)}
            />
            <div className="w-72 bg-card border-l border-border flex flex-col md:border-r md:border-l-0 h-full md:h-auto shadow-xl md:shadow-none">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-sm text-foreground">Medicamentos de {primerNombre}</h2>
                <button onClick={() => setPanelAbierto(false)} className="text-muted-foreground hover:text-foreground">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <MedicamentosPanel medicamentos={medicamentos} />
              </div>
              <div className="p-4 border-t border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  💬 Cuéntale a QUETAI sobre tus pastillas y él las guardará por ti.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Área de chat */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mensajes */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto chat-scroll px-4 py-5 space-y-4"
            style={{ minHeight: 0, maxHeight: "calc(100dvh - 7rem)" }}
          >
            {mensajes.map(msg => (
              <MensajeBurbuja key={msg.id} mensaje={msg} />
            ))}

            {/* Streaming en progreso */}
            {streaming && streamingText && (
              <div className="flex justify-start msg-enter">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-1">
                  <svg width="16" height="16" viewBox="0 0 40 40" fill="none">
                    <path d="M20 28s-9-5.5-9-11.5A5.5 5.5 0 0 1 20 14.1 5.5 5.5 0 0 1 29 16.5C29 22.5 20 28 20 28z" fill="hsl(152,38%,36%)" />
                  </svg>
                </div>
                <div className="bubble-assistant">
                  <RenderTexto texto={streamingText} />
                  <span className="inline-block w-0.5 h-4 bg-primary/60 ml-0.5 animate-pulse align-middle" />
                </div>
              </div>
            )}

            {/* Typing dots cuando aún no hay texto */}
            {streaming && !streamingText && <TypingIndicator />}
          </div>

          {/* Input de chat */}
          <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3">
            <form onSubmit={enviarMensaje} className="flex gap-2 items-end">
              <Input
                ref={inputRef}
                data-testid="input-mensaje"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Escribe algo, ${primerNombre}...`}
                disabled={streaming}
                className="flex-1 rounded-2xl h-11 text-base bg-card border-border resize-none"
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarMensaje();
                  }
                }}
              />
              <Button
                data-testid="btn-enviar"
                type="submit"
                disabled={!input.trim() || streaming}
                className="h-11 w-11 p-0 rounded-2xl flex-shrink-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/>
                </svg>
                <span className="sr-only">Enviar</span>
              </Button>
            </form>
            <div className="mt-2 flex justify-center">
              <PerplexityAttribution />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
