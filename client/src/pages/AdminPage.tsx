import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { API_BASE, apiRequest } from "@/lib/queryClient";
import {
  Users, MessageSquare, Pill, TrendingUp, Trash2,
  Eye, ChevronDown, ChevronUp, ArrowLeft, LogOut, RefreshCw
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

// ─── Hook admin auth ───────────────────────────────────────────────────────────
function useAdminToken() {
  const [token, setToken] = useState<string | null>(null);
  return { token, setToken, logout: () => setToken(null) };
}

// ─── Login ─────────────────────────────────────────────────────────────────────
function LoginPanel({ onLogin }: { onLogin: (t: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok) onLogin(data.token);
      else setError("PIN incorrecto");
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="w-full max-w-xs space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Panel de Administración</h1>
          <p className="text-sm text-muted-foreground">QUETAI</p>
        </div>
        <Card className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">PIN de acceso</label>
            <Input
              type="password"
              placeholder="Ingresa el PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              maxLength={10}
              className="h-11 rounded-xl text-center text-lg tracking-widest"
              autoFocus
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <Button onClick={login} disabled={loading} className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90">
            {loading ? "Verificando..." : "Entrar"}
          </Button>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Volver al chat
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Panel principal ───────────────────────────────────────────────────────────
function AdminPanel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [verConv, setVerConv] = useState<string | null>(null);

  const headers = { "x-admin-token": token };

  const { data: stats, isLoading: loadingStats } = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetch(`${API_BASE}/api/admin/stats`, { headers }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: usuarios, isLoading: loadingUsers } = useQuery<UsuarioAdmin[]>({
    queryKey: ["/api/admin/usuarios"],
    queryFn: () => fetch(`${API_BASE}/api/admin/usuarios`, { headers }).then((r) => r.json()),
  });

  const { data: mensajesConv } = useQuery<MensajeAdmin[]>({
    queryKey: ["/api/admin/conv", verConv],
    queryFn: () =>
      verConv
        ? fetch(`${API_BASE}/api/admin/usuarios/${verConv}/mensajes`, { headers }).then((r) => r.json())
        : Promise.resolve([]),
    enabled: !!verConv,
  });

  const deleteUser = useMutation({
    mutationFn: (sid: string) =>
      fetch(`${API_BASE}/api/admin/usuarios/${sid}`, { method: "DELETE", headers }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/usuarios"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Usuario eliminado" });
    },
  });

  const clearConv = useMutation({
    mutationFn: (sid: string) =>
      fetch(`${API_BASE}/api/admin/usuarios/${sid}/mensajes`, { method: "DELETE", headers }).then((r) => r.json()),
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
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-sm">Panel de Administración</h1>
              <p className="text-xs text-muted-foreground">QUETAI</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={refresh} title="Actualizar">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Usuarios", value: stats.totalUsuarios, icon: Users, color: "text-primary" },
              { label: "Mensajes", value: stats.totalMensajes, icon: MessageSquare, color: "text-accent" },
              { label: "Medicamentos", value: stats.totalMeds, icon: Pill, color: "text-green-500" },
              { label: "Nuevos hoy", value: stats.nuevosHoy, icon: TrendingUp, color: "text-blue-500" },
            ].map((s) => (
              <Card key={s.label} className="p-4 flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color} opacity-80`} />
                <div>
                  <div className="text-2xl font-bold leading-none">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Modal conversación */}
        {verConv && (
          <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex flex-col">
            <div className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm">Conversación</h2>
                <p className="text-xs text-muted-foreground">{usuarios?.find((u) => u.sessionId === verConv)?.nombre}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setVerConv(null)}>Cerrar</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-w-2xl mx-auto w-full">
              {mensajesConv?.map((m) => (
                <div key={m.id} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                    m.rol === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}>
                    <p>{m.contenido}</p>
                    <p className="text-xs opacity-50 mt-1">{new Date(m.creadoEn).toLocaleString("es")}</p>
                  </div>
                </div>
              ))}
              {!mensajesConv?.length && (
                <p className="text-center text-muted-foreground text-sm py-8">Sin mensajes</p>
              )}
            </div>
          </div>
        )}

        {/* Lista de usuarios */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Usuarios registrados
            </h2>
            <Badge variant="secondary">{usuarios?.length ?? 0}</Badge>
          </div>

          {loadingUsers && (
            <div className="text-center text-muted-foreground py-8">Cargando...</div>
          )}

          {usuarios?.map((u) => (
            <Card key={u.sessionId} className="overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedUser(expandedUser === u.sessionId ? null : u.sessionId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary text-sm">
                    {u.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{u.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.creadoEn).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                      {" · "}{u.mensajesCount} mensajes
                      {u.medicamentos.length > 0 && ` · ${u.medicamentos.length} medicamentos`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {u.medicamentos.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <Pill className="w-3 h-3 mr-1" />{u.medicamentos.length}
                    </Badge>
                  )}
                  {expandedUser === u.sessionId
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {expandedUser === u.sessionId && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                  {/* Session ID */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">ID de sesión</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">{u.sessionId}</code>
                  </div>

                  {/* Medicamentos */}
                  {u.medicamentos.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Medicamentos</p>
                      <div className="flex flex-wrap gap-1">
                        {u.medicamentos.map((m) => (
                          <Badge key={m.id} variant="outline" className="text-xs">
                            <Pill className="w-3 h-3 mr-1 text-accent" />
                            {m.nombre} · {m.horario}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { setVerConv(u.sessionId); }}
                      className="text-xs h-8"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Ver conversación
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => clearConv.mutate(u.sessionId)}
                      className="text-xs h-8 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Borrar conversación
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${u.nombre} y todos sus datos?`)) {
                          deleteUser.mutate(u.sessionId);
                          if (expandedUser === u.sessionId) setExpandedUser(null);
                        }
                      }}
                      className="text-xs h-8 text-destructive hover:bg-destructive/10 border-destructive/30"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar usuario
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}

          {!loadingUsers && usuarios?.length === 0 && (
            <Card className="p-8 text-center">
              <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No hay usuarios registrados aún.</p>
            </Card>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          QUETAI Admin · <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Perplexity Computer</a>
        </p>
      </main>
    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { token, setToken, logout } = useAdminToken();
  if (!token) return <LoginPanel onLogin={setToken} />;
  return <AdminPanel token={token} onLogout={logout} />;
}
