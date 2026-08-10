"use client";

import type { Zona } from "@/lib/types";

const AREAS = [
  { id: "terraza1", nombre: "Terraza 1", x: 12, y: 12, w: 34, h: 24 },
  { id: "terraza2", nombre: "Terraza 2", x: 54, y: 12, w: 34, h: 24 },
  { id: "tarima-izq", nombre: "Tarima izq.", x: 12, y: 45, w: 24, h: 20 },
  { id: "pista", nombre: "Pista", x: 40, y: 43, w: 20, h: 34 },
  { id: "tarima-der", nombre: "Tarima der.", x: 64, y: 45, w: 24, h: 20 },
] as const;

export function MapaZonas({
  zonas, seleccionada, onSeleccionar, nombreLocal,
}: {
  zonas: Zona[];
  seleccionada: string;
  onSeleccionar: (zonaId: string) => void;
  nombreLocal: string;
}) {
  const porId = new Map(zonas.map((zona) => [zona.id, zona]));

  return (
    <div className="card p-3 border-neon3/30">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold text-sm">Mapa de {nombreLocal}</p>
          <p className="text-[10px] text-muted">Toca la zona donde te encuentras.</p>
        </div>
        <span className="text-[10px] text-muted">ENTRADA ↓</span>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Mapa interactivo de zonas" className="w-full rounded-xl bg-background border border-line">
        <defs>
          <linearGradient id="mapa-pista" x1="0" x2="1">
            <stop offset="0" stopColor="#b644ff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ff2d9a" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="92" height="92" rx="4" fill="#100e1c" stroke="#262143" />
        {AREAS.map((area) => {
          const zona = porId.get(area.id);
          const activa = seleccionada === area.id;
          const entregable = zona?.entregable ?? false;
          return (
            <g
              key={area.id}
              onClick={() => entregable && onSeleccionar(area.id)}
              className={entregable ? "cursor-pointer" : "cursor-not-allowed"}
              role="button"
              aria-label={`${area.nombre}${entregable ? "" : ", sin entrega"}`}
            >
              <rect
                x={area.x} y={area.y} width={area.w} height={area.h} rx="3"
                fill={activa ? "#22d3ee33" : area.id === "pista" ? "url(#mapa-pista)" : "#17142a"}
                stroke={activa ? "#22d3ee" : entregable ? "#544a7a" : "#3b3653"}
                strokeWidth={activa ? 1.5 : 0.7}
                strokeDasharray={entregable ? undefined : "2 2"}
              />
              <text
                x={area.x + area.w / 2} y={area.y + area.h / 2 - (activa ? 2 : 0)}
                textAnchor="middle" dominantBaseline="middle"
                fill={activa ? "#22d3ee" : entregable ? "#f2f0fa" : "#8d87ad"}
                fontSize="4" fontWeight={activa ? "700" : "500"}
              >
                {area.nombre}
              </text>
              {!entregable && (
                <text x={area.x + area.w / 2} y={area.y + area.h / 2 + 5} textAnchor="middle" fill="#8d87ad" fontSize="2.7">
                  SIN ENTREGA
                </text>
              )}
              {activa && (
                <g>
                  <circle cx={area.x + area.w / 2} cy={area.y + area.h / 2 + 6} r="2.3" fill="#22d3ee" />
                  <circle cx={area.x + area.w / 2} cy={area.y + area.h / 2 + 6} r="4" fill="none" stroke="#22d3ee" strokeOpacity="0.35" />
                </g>
              )}
            </g>
          );
        })}
        <rect x="32" y="84" width="36" height="8" rx="2" fill="#ff2d9a22" stroke="#ff2d9a88" />
        <text x="50" y="89" textAnchor="middle" fill="#ff2d9a" fontSize="3.7" fontWeight="700">BARRA</text>
        <path d="M50 98 L47 94 H53 Z" fill="#8d87ad" />
      </svg>
      {seleccionada && (
        <p className="mt-2 rounded-lg bg-neon3/10 text-neon3 text-sm font-semibold text-center py-2">
          📍 Estás en {porId.get(seleccionada)?.nombre}
        </p>
      )}
    </div>
  );
}
