// QUETAI — Bubble de recordatorio de medicamentos
// Aparece cuando la app está abierta y hay un medicamento que tomar ahora

import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/queryClient";
import { X, Pill } from "lucide-react";

interface Recordatorio {
  id: number;
  nombre: string;
  horario: string;
  mensaje: string;
}

interface Props {
  sessionId: string;
  onHablar?: (texto: string) => void; // callback para leer en voz alta
}

export default function RecordatorioBubble({ sessionId, onHablar }: Props) {
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  const verificar = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/session/${sessionId}/recordatorios-ahora`);
      if (!res.ok) return;
      const data = await res.json();
      const nuevos: Recordatorio[] = (data.recordatorios || []).filter((r: Recordatorio) => {
        const key = `${r.id}-${new Date().toISOString().slice(0, 16)}`; // clave por minuto
        return !descartados.has(key);
      });
      if (nuevos.length > 0) {
        setRecordatorios(nuevos);
        // Leer en voz alta el primero
        if (onHablar && nuevos[0]) {
          onHablar(nuevos[0].mensaje);
        }
      }
    } catch { /* silencioso */ }
  }, [sessionId, descartados, onHablar]);

  // Polling cada 30 segundos, sincronizado con el reloj
  useEffect(() => {
    if (!sessionId) return;

    // Verificar inmediatamente
    verificar();

    // Luego cada 30 segundos
    const interval = setInterval(verificar, 30_000);
    return () => clearInterval(interval);
  }, [sessionId, verificar]);

  const descartar = (rec: Recordatorio) => {
    const key = `${rec.id}-${new Date().toISOString().slice(0, 16)}`;
    setDescartados(prev => new Set([...prev, key]));
    setRecordatorios(prev => prev.filter(r => r.id !== rec.id));
  };

  if (recordatorios.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-3 px-4 pointer-events-none">
      {recordatorios.map(rec => (
        <div
          key={rec.id}
          className="w-full max-w-sm pointer-events-auto animate-bounce-in"
          style={{
            animation: "slideUp 0.4s ease-out",
          }}
        >
          {/* Bubble principal */}
          <div className="bg-accent text-accent-foreground rounded-3xl shadow-2xl overflow-hidden">
            {/* Header con ícono */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <Pill className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg leading-tight">¡Hora de tu pastilla!</p>
                <p className="text-sm opacity-80 leading-tight">{rec.nombre} · {rec.horario}</p>
              </div>
              <button
                onClick={() => descartar(rec)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensaje */}
            <p className="px-5 pb-3 text-base leading-relaxed opacity-95">
              {rec.mensaje}
            </p>

            {/* Botón de confirmación */}
            <div className="px-5 pb-5">
              <button
                onClick={() => descartar(rec)}
                className="w-full py-3 rounded-2xl bg-white/20 hover:bg-white/30 font-bold text-base transition-all active:scale-95"
              >
                ✓ Ya la tomé
              </button>
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
