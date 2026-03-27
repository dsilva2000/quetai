// QUETAI — Guía de instalación Android (Chrome)
// Tutorial visual paso a paso para instalar QUETAI como app

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";

interface Props {
  onClose: () => void;
  onInstalado?: () => void;
}

// ─── Ilustraciones SVG por paso ───────────────────────────────────────────────

function IlustracionPaso1() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Pantalla del celular */}
      <rect x="60" y="10" width="160" height="180" rx="16" fill="#f5f0e8" stroke="#d4c9b0" strokeWidth="2"/>
      <rect x="65" y="20" width="150" height="165" rx="12" fill="white"/>

      {/* Barra de URL del browser */}
      <rect x="72" y="26" width="130" height="22" rx="6" fill="#f0ebe0"/>
      <text x="137" y="41" textAnchor="middle" fontSize="9" fill="#888" fontFamily="sans-serif">quetai-production.up.railway.app</text>

      {/* Contenido de la página */}
      <rect x="72" y="56" width="130" height="40" rx="8" fill="#e8f4ee"/>
      <circle cx="100" cy="76" r="12" fill="#4a7c59" opacity="0.8"/>
      <text x="100" y="80" textAnchor="middle" fontSize="10" fill="white" fontFamily="sans-serif" fontWeight="bold">Q</text>
      <text x="125" y="70" fontSize="9" fill="#4a7c59" fontFamily="sans-serif" fontWeight="bold">QUETAI</text>
      <text x="125" y="83" fontSize="8" fill="#888" fontFamily="sans-serif">Tu amigo de cada día</text>

      {/* Tres puntitos del menú — resaltados con círculo */}
      <circle cx="195" cy="32" r="13" fill="#e87c3e" opacity="0.2"/>
      <circle cx="195" cy="32" r="11" fill="none" stroke="#e87c3e" strokeWidth="2" strokeDasharray="4,2"/>
      {/* Los tres puntos verticales */}
      <circle cx="195" cy="26" r="2" fill="#333"/>
      <circle cx="195" cy="32" r="2" fill="#333"/>
      <circle cx="195" cy="38" r="2" fill="#333"/>

      {/* Flecha apuntando a los tres puntos */}
      <path d="M215 32 L230 20" stroke="#e87c3e" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M226 18 L230 20 L228 24" stroke="#e87c3e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>

      {/* Dedo tocando */}
      <ellipse cx="240" cy="16" rx="8" ry="10" fill="#f5c5a3" stroke="#e8a882" strokeWidth="1"/>
      <rect x="236" y="20" width="8" height="16" rx="4" fill="#f5c5a3" stroke="#e8a882" strokeWidth="1"/>
    </svg>
  );
}

function IlustracionPaso2() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Celular de fondo */}
      <rect x="60" y="10" width="160" height="180" rx="16" fill="#f5f0e8" stroke="#d4c9b0" strokeWidth="2"/>
      <rect x="65" y="20" width="150" height="165" rx="12" fill="white" opacity="0.5"/>

      {/* Menú desplegable */}
      <rect x="110" y="15" width="115" height="170" rx="10" fill="white" stroke="#e0d8cc" strokeWidth="1.5"
        style={{filter: "drop-shadow(0px 4px 12px rgba(0,0,0,0.15))"}}/>

      {/* Opciones del menú */}
      {[
        { y: 38, texto: "Nueva pestaña", icon: "+" },
        { y: 65, texto: "Nueva vent. incóg.", icon: "◐" },
        { y: 92, texto: "Marcadores", icon: "☆" },
        { y: 119, texto: "Historial", icon: "⏱" },
        { y: 146, texto: "Agregar a pantalla", icon: "⊕", resaltado: true },
        { y: 173, texto: "Configuración", icon: "⚙" },
      ].map((item) => (
        <g key={item.y}>
          {item.resaltado && (
            <rect x="113" y={item.y - 14} width="109" height="26" rx="6" fill="#e8f4ee"/>
          )}
          <text x="125" y={item.y + 1} fontSize="11" fill={item.resaltado ? "#4a7c59" : "#555"}
            fontFamily="sans-serif" fontWeight={item.resaltado ? "bold" : "normal"}>
            {item.icon}
          </text>
          <text x="140" y={item.y + 1} fontSize="10" fill={item.resaltado ? "#4a7c59" : "#555"}
            fontFamily="sans-serif" fontWeight={item.resaltado ? "bold" : "normal"}>
            {item.texto}
          </text>
          {item.resaltado && (
            <>
              {/* Flecha y dedo */}
              <path d="M100 146 L115 146" stroke="#e87c3e" strokeWidth="2.5" strokeLinecap="round"
                markerEnd="url(#arrow)"/>
              <circle cx="92" cy="146" r="8" fill="#e87c3e" opacity="0.2"/>
              <circle cx="92" cy="146" r="6" fill="none" stroke="#e87c3e" strokeWidth="2"/>
            </>
          )}
        </g>
      ))}

      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#e87c3e"/>
        </marker>
      </defs>
    </svg>
  );
}

function IlustracionPaso3() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Celular */}
      <rect x="60" y="10" width="160" height="180" rx="16" fill="#f5f0e8" stroke="#d4c9b0" strokeWidth="2"/>
      <rect x="65" y="20" width="150" height="165" rx="12" fill="white"/>

      {/* Diálogo "Agregar a pantalla de inicio" */}
      <rect x="72" y="30" width="136" height="85" rx="10" fill="white" stroke="#e0d8cc" strokeWidth="1"
        style={{filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.1))"}}/>
      <text x="140" y="50" textAnchor="middle" fontSize="10" fill="#333" fontFamily="sans-serif" fontWeight="bold">
        Agregar a pantalla
      </text>
      <text x="140" y="63" textAnchor="middle" fontSize="10" fill="#333" fontFamily="sans-serif" fontWeight="bold">
        de inicio
      </text>

      {/* Preview del ícono */}
      <rect x="115" y="68" width="50" height="20" rx="6" fill="#f0ebe0"/>
      <circle cx="128" cy="78" r="6" fill="#4a7c59"/>
      <text x="128" y="81" textAnchor="middle" fontSize="6" fill="white" fontFamily="sans-serif" fontWeight="bold">Q</text>
      <text x="148" y="81" textAnchor="middle" fontSize="8" fill="#555" fontFamily="sans-serif">QUETAI</text>

      {/* Botón Agregar — resaltado */}
      <rect x="85" y="96" width="110" height="14" rx="7" fill="#4a7c59"/>
      <text x="140" y="106" textAnchor="middle" fontSize="9" fill="white" fontFamily="sans-serif" fontWeight="bold">
        Agregar
      </text>

      {/* Dedo tocando el botón */}
      <ellipse cx="140" cy="118" rx="7" ry="9" fill="#f5c5a3" stroke="#e8a882" strokeWidth="1"/>
      <rect x="136" y="122" width="8" height="14" rx="4" fill="#f5c5a3" stroke="#e8a882" strokeWidth="1"/>

      {/* Flecha hacia abajo al botón */}
      <path d="M140 112 L140 108" stroke="#e87c3e" strokeWidth="2" strokeLinecap="round"/>
      <path d="M136 110 L140 112 L144 110" stroke="#e87c3e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IlustracionPaso4() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-[280px] mx-auto" aria-hidden="true">
      {/* Celular */}
      <rect x="60" y="10" width="160" height="180" rx="16" fill="#f5f0e8" stroke="#d4c9b0" strokeWidth="2"/>
      <rect x="65" y="20" width="150" height="165" rx="12" fill="#e8f4ee"/>

      {/* Pantalla de inicio simulada con apps */}
      {[0,1,2,3,4,5,6,7].map(i => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 80 + col * 35;
        const y = 40 + row * 50;
        const isQuetai = i === 3;
        return (
          <g key={i}>
            <rect x={x - 13} y={y - 13} width="26" height="26" rx="7"
              fill={isQuetai ? "#4a7c59" : "#ddd"} opacity={isQuetai ? 1 : 0.5}/>
            {isQuetai && (
              <>
                <circle cx={x} cy={y} r="8" fill="rgba(255,255,255,0.15)"/>
                <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="white"
                  fontFamily="sans-serif" fontWeight="bold">Q</text>
                {/* Brillo de instalación nueva */}
                <circle cx={x + 10} cy={y - 12} r="5" fill="#e87c3e"/>
                <text x={x + 10} y={y - 9} textAnchor="middle" fontSize="7" fill="white"
                  fontFamily="sans-serif">✓</text>
              </>
            )}
            <text x={x} y={y + 23} textAnchor="middle" fontSize="7"
              fill={isQuetai ? "#2d5a3d" : "#999"} fontFamily="sans-serif"
              fontWeight={isQuetai ? "bold" : "normal"}>
              {isQuetai ? "QUETAI" : ""}
            </text>
          </g>
        );
      })}

      {/* Texto de celebración */}
      <rect x="72" y="140" width="136" height="36" rx="10" fill="white" opacity="0.9"/>
      <text x="140" y="157" textAnchor="middle" fontSize="11" fill="#4a7c59"
        fontFamily="sans-serif" fontWeight="bold">¡Ya está instalada! 🎉</text>
      <text x="140" y="170" textAnchor="middle" fontSize="9" fill="#888" fontFamily="sans-serif">
        Ábrela siempre desde aquí
      </text>
    </svg>
  );
}

// ─── Pasos del tutorial ────────────────────────────────────────────────────────
const PASOS = [
  {
    numero: 1,
    titulo: "Toca los tres puntitos",
    descripcion: "En Chrome, busca los tres puntitos ⋮ arriba a la derecha de la pantalla y tócalos.",
    ilustracion: IlustracionPaso1,
    color: "bg-orange-50 border-orange-200",
    colorDot: "bg-orange-400",
  },
  {
    numero: 2,
    titulo: 'Elige "Agregar a pantalla de inicio"',
    descripcion: 'Se abre un menú. Busca la opción que dice "Agregar a pantalla de inicio" y tócala.',
    ilustracion: IlustracionPaso2,
    color: "bg-blue-50 border-blue-200",
    colorDot: "bg-blue-400",
  },
  {
    numero: 3,
    titulo: 'Toca el botón "Agregar"',
    descripcion: 'Aparece una ventanita con el nombre QUETAI. Toca el botón verde que dice "Agregar".',
    ilustracion: IlustracionPaso3,
    color: "bg-emerald-50 border-emerald-200",
    colorDot: "bg-emerald-500",
  },
  {
    numero: 4,
    titulo: "¡Listo! Abre QUETAI desde ahí",
    descripcion: "El ícono de QUETAI aparece en tu pantalla de inicio. Ábrelo siempre desde ahí para recibir recordatorios.",
    ilustracion: IlustracionPaso4,
    color: "bg-green-50 border-green-200",
    colorDot: "bg-green-500",
  },
];

// ─── Componente principal ──────────────────────────────────────────────────────
export default function InstallGuide({ onClose, onInstalado }: Props) {
  const [paso, setPaso] = useState(0);
  const pasoActual = PASOS[paso];
  const Ilustracion = pasoActual.ilustracion;
  const esUltimo = paso === PASOS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-background rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">Instala QUETAI en tu celular</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Para recibir recordatorios de tus pastillas</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 px-5 pb-4">
          {PASOS.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`transition-all duration-300 rounded-full ${
                i < paso
                  ? "w-6 h-6 bg-primary flex items-center justify-center"
                  : i === paso
                  ? "w-6 h-6 bg-primary flex items-center justify-center ring-4 ring-primary/20"
                  : "w-2.5 h-2.5 bg-muted"
              }`}>
                {i < paso ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : i === paso ? (
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                ) : null}
              </div>
              {i < PASOS.length - 1 && (
                <div className={`h-0.5 flex-1 w-8 transition-all duration-300 ${i < paso ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Tarjeta del paso actual */}
        <div className={`mx-4 mb-4 rounded-2xl border-2 p-5 ${pasoActual.color} transition-all`}>
          {/* Número y título */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-9 h-9 rounded-full ${pasoActual.colorDot} flex items-center justify-center shrink-0`}>
              <span className="text-white font-bold text-base">{pasoActual.numero}</span>
            </div>
            <h3 className="text-lg font-bold text-foreground leading-tight">{pasoActual.titulo}</h3>
          </div>

          {/* Ilustración */}
          <div className="bg-white/70 rounded-2xl p-3 mb-4">
            <Ilustracion />
          </div>

          {/* Descripción */}
          <p className="text-base text-foreground leading-relaxed text-center">{pasoActual.descripcion}</p>
        </div>

        {/* Botones de navegación */}
        <div className="flex gap-3 px-4 pb-5">
          {paso > 0 && (
            <button
              onClick={() => setPaso(p => p - 1)}
              className="flex items-center gap-1.5 px-5 py-3.5 rounded-2xl border-2 border-border text-base font-semibold text-muted-foreground hover:bg-muted transition-all active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
              Atrás
            </button>
          )}

          {!esUltimo ? (
            <button
              onClick={() => setPaso(p => p + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-2xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all active:scale-95"
            >
              Siguiente
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => {
                onInstalado?.();
                onClose();
              }}
              className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all active:scale-95"
            >
              ¡Ya lo instalé! 🎉
            </button>
          )}
        </div>

        {/* Nota al pie */}
        <p className="text-center text-sm text-muted-foreground pb-5 px-6 leading-relaxed">
          Solo funciona en <strong>Chrome para Android</strong>. Después de instalar, ábrela siempre desde el ícono.
        </p>
      </div>
    </div>
  );
}
