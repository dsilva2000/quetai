import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/queryClient";
import {
  Users, MessageSquare, Pill, TrendingUp, Trash2,
  Eye, ChevronDown, ChevronUp, ArrowLeft, LogOut,
  RefreshCw, Download, X, ShieldCheck
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Stats { totalUsuarios: number; totalMensajes: number; totalMeds: number; nuevosHoy: number; }
interface UsuarioAdmin {
  id: number; sessionId: string; nombre: string; creadoEn: string;
  medicamentos: { id: number; nombre: string; horario: string }[];
  mensajesCount: number;
}
interface MensajeAdmin { id: number; rol: string; contenido: string; orden: number; creadoEn: string; }

// ─── Helpers ───────────────────────────────────────────────────────────────────
function exportarCSV(usuarios: UsuarioAdmin[]) {
  const filas = [
    ["Nombre", "Registrado", "Mensajes", "Medicamentos", "Session ID"],
    ...usuarios.map(u => [
      u.nombre,
      new Date(u.creadoEn).toLocaleDateString("es"),
      String(u.mensajesCount),
      u.medicamentos.map(m => `${m.nombre} (${m.horario})`).join(" | "),
      u.sessionId,
    ])
  ];
  const csv = filas.map(f => f.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `quetai-usuarios-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Login ─────────────────────────────────────────────────────────────────────
function LoginPanel({ onLogin }: { onLogin: (t: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!pin) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok) onLogin(data.token);
      else setError("PIN incorrecto. Inténtalo de nuevo.");
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Administración</h1>
            <p className="text-muted-foreground text-base mt-1">QUETAI v4.4</p>
          </div>
        </div>

        <Card className="p-7 space-y-5 rounded-3xl">
          <div className="space-y-2">
            <label className="text-base font-semibold">PIN de acceso</label>
            <Input
              type="password"
              placeholder="• • • •"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              maxLength={10}
              className="h-14 rounded-2xl text-center text-2xl tracking-[0.5em]"
              autoFocus
            />
            {error && (
              <p className="text-destructive text-sm font-medium text-center">{error}</p>
            )}
          </div>
          <button
            onClick={login}
            disabled={loading || !pin}
            className="w-full h-14 rounded-2xl text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-base text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver al chat
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Modal conversación ────────────────────────────────────────────────────────
function ModalConversacion({
  sessionId, nombre, token, onClose
}: { sessionId: string; nombre: string; token: string; onClose: () => void }) {
  const { data: mensajes } = useQuery<MensajeAdmin[]>({
    queryKey: ["/api/admin/conv", sessionId],
    queryFn: () =>
      fetch(`${API_BASE}/api/admin/usuarios/${sessionId}/mensajes`, {
        headers: { "x-admin-token": token }
      }).then(r => r.json()),
  });

  const exportarConv = () => {
    if (!mensajes?.length) return;
    const texto = mensajes.map(m =>
      `[${new Date(m.creadoEn).toLocaleString("es")}] ${m.rol === "user" ? nombre : "QUETAI"}: ${m.contenido}`
    ).join("\n\n");
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quetai-conv-${nombre.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0,10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex flex-col">
      <div className="border-b border-border bg-card px-4 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-bold text-lg">Conversación de {nombre}</h2>
          <p className="text-sm text-muted-foreground">{mensajes?.length ?? 0} mensajes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarConv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {mensajes?.map((m) => (
          <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-base ${
              m.rol === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-card border border-border rounded-bl-sm"
            }`}>
              <p className="leading-relaxed">{m.contenido}</p>
              <p className="text-xs opacity-50 mt-1">
                {new Date(m.creadoEn).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          </div>
        ))}
        {!mensajes?.length && (
          <div className="text-center text-muted-foreground py-16">Sin mensajes aún</div>
        )}
      </div>
    </div>
  );
}

// ─── Panel principal ───────────────────────────────────────────────────────────
function AdminPanel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [verConv, setVerConv] = useState<{ sid: string; nombre: string } | null>(null);

  const headers = { "x-admin-token": token };

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch(`${API_BASE}/api/admin/stats`, { headers }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: usuarios, isLoading: loadingUsers } = useQuery<UsuarioAdmin[]>({
    queryKey: ["/api/admin/usuarios"],
    queryFn: () => fetch(`${API_BASE}/api/admin/usuarios`, { headers }).then(r => r.json()),
  });

  const deleteUser = useMutation({
    mutationFn: (sid: string) =>
      fetch(`${API_BASE}/api/admin/usuarios/${sid}`, { method: "DELETE", headers }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Usuario eliminado" });
    },
  });

  const clearConv = useMutation({
    mutationFn: (sid: string) =>
      fetch(`${API_BASE}/api/admin/usuarios/${sid}/mensajes`, { method: "DELETE", headers }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });
      toast({ title: "Conversación borrada" });
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Modal conversación */}
      {verConv && (
        <ModalConversacion
          sessionId={verConv.sid}
          nombre={verConv.nombre}
          token={token}
          onClose={() => setVerConv(null)}
        />
      )}

      {/* Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className="font-bold text-base leading-tight">Panel de Administración</h1>
              <p className="text-xs text-muted-foreground">QUETAI v4.4</p>
            </div>
          </div>
          <div className="flex gap-2">
            {usuarios && usuarios.length > 0 && (
              <button
                onClick={() => exportarCSV(usuarios)}
                title="Exportar CSV"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            )}
            <button
              onClick={refresh}
              title="Actualizar"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Usuarios", value: stats.totalUsuarios, icon: Users, color: "text-primary", bg: "bg-primary/10" },
              { label: "Mensajes", value: stats.totalMensajes, icon: MessageSquare, color: "text-accent", bg: "bg-accent/10" },
              { label: "Medicamentos", value: stats.totalMeds, icon: Pill, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
              { label: "Nuevos hoy", value: stats.nuevosHoy, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
            ].map((s) => (
              <Card key={s.label} className="p-4 rounded-2xl">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div className="text-3xl font-bold leading-none">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Lista de usuarios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Usuarios registrados
            </h2>
            <Badge variant="secondary" className="text-sm px-2.5">{usuarios?.length ?? 0}</Badge>
          </div>

          {loadingUsers && (
            <div className="text-center text-muted-foreground py-12 text-base">Cargando usuarios…</div>
          )}

          {usuarios?.map((u) => (
            <Card key={u.sessionId} className="overflow-hidden rounded-2xl">
              {/* Fila del usuario */}
              <div
                className="flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedUser(expandedUser === u.sessionId ? null : u.sessionId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary text-lg shrink-0">
                    {u.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-base">{u.nombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(u.creadoEn).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                      {" · "}{u.mensajesCount} mensajes
                      {u.medicamentos.length > 0 && ` · ${u.medicamentos.length} med.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {u.medicamentos.length > 0 && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Pill className="w-3 h-3" />{u.medicamentos.length}
                    </Badge>
                  )}
                  {expandedUser === u.sessionId
                    ? <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </div>

              {/* Detalle expandido */}
              {expandedUser === u.sessionId && (
                <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/20">
                  {/* Medicamentos */}
                  {u.medicamentos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Medicamentos</p>
                      <div className="flex flex-wrap gap-2">
                        {u.medicamentos.map((m) => (
                          <Badge key={m.id} variant="outline" className="text-sm py-1 gap-1">
                            <Pill className="w-3 h-3 text-accent" />
                            {m.nombre} · {m.horario}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Session ID */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">ID de sesión</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded-lg font-mono break-all">{u.sessionId}</code>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => setVerConv({ sid: u.sessionId, nombre: u.nombre })}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                    >
                      <Eye className="w-4 h-4" /> Ver conversación
                    </button>
                    <button
                      onClick={() => clearConv.mutate(u.sessionId)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> Borrar mensajes
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${u.nombre} y todos sus datos permanentemente?`)) {
                          deleteUser.mutate(u.sessionId);
                          if (expandedUser === u.sessionId) setExpandedUser(null);
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-destructive/30 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Eliminar usuario
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}

          {!loadingUsers && (!usuarios || usuarios.length === 0) && (
            <Card className="p-12 text-center rounded-2xl">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
              <p className="text-muted-foreground text-base">Aún no hay usuarios registrados.</p>
            </Card>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-6 flex items-center justify-center gap-1.5 flex-wrap">
          <a href="https://www.quetai.tech" target="_blank" rel="noopener noreferrer"
            className="font-semibold hover:text-foreground transition-colors">QUETAI</a>
          <span>es un servicio de</span>
          <a href="https://www.mancolab.com" target="_blank" rel="noopener noreferrer"
            className="font-semibold hover:text-foreground transition-colors">MancoLab</a>
          <span>© 2026 · v4.4</span>
        </p>
      </main>
    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  if (!token) return <LoginPanel onLogin={setToken} />;
  return <AdminPanel token={token} onLogout={() => setToken(null)} />;
}
