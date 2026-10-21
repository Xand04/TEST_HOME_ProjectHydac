"use client";

import { useId, useRef, useState } from "react";
import type { SalesData } from "../lib/types";

const COLORS = ["#163d64", "#367ba4", "#6ba7ba", "#a6c6bd", "#d4ba7e"];
const formatEuro = (value: number) => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1,
}).format(value);

export default function Charts({ sales }: { sales: SalesData }) {
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const clipId = `revenue-${useId().replaceAll(":", "")}`;
  const years = [...sales.umsatzJeJahr].sort((a, b) => a.jahr - b.jahr);
  const maximum = Math.max(...years.map((entry) => entry.umsatz), 1) * 1.15 / zoom;
  const points = years.map((entry, index) => ({
    ...entry,
    x: 65 + index * 275 / Math.max(years.length - 1, 1),
    y: 150 - entry.umsatz / maximum * 125,
  }));
  const mix = sales.produktgruppenMix.filter((entry) => entry.prozent > 0);
  const total = mix.reduce((sum, entry) => sum + entry.prozent, 0);
  const distance = (touches: React.TouchList) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );

  return (
    <div className="ds-charts">
      {years.length > 0 && (
        <figure className="ds-chart">
          <div className="ds-chart-title">
            <figcaption>Unser Umsatzverlauf</figcaption>
            <div className="ds-chart-controls" aria-label="Achsenskala">
              <button type="button" aria-label="Umsatzachse verkleinern" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
              <button type="button" aria-label="Achsenskala zurücksetzen" onClick={() => setZoom(1)}>{Math.round(zoom * 100)} %</button>
              <button type="button" aria-label="Umsatzachse vergrößern" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>+</button>
            </div>
          </div>
          <svg
            className="ds-line-chart chart-zoom"
            viewBox="0 0 360 190"
            role="img"
            aria-label={`Umsatzverlauf: ${years.map((entry) => `${entry.jahr}: ${formatEuro(entry.umsatz)}`).join(", ")}`}
            onTouchStart={(event) => {
              if (event.touches.length === 2) pinch.current = { distance: distance(event.touches), zoom };
            }}
            onTouchMove={(event) => {
              if (event.touches.length === 2 && pinch.current) {
                event.stopPropagation();
                setZoom(Math.max(0.5, Math.min(3, pinch.current.zoom * distance(event.touches) / pinch.current.distance)));
              }
            }}
            onTouchEnd={() => { pinch.current = null; }}
          >
            <defs><clipPath id={clipId}><rect x="60" y="10" width="290" height="145" /></clipPath></defs>
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <line x1="65" x2="340" y1={150 - fraction * 125} y2={150 - fraction * 125} stroke="#e6ebf0" />
                <text x="57" y={155 - fraction * 125} textAnchor="end" fill="#637282" fontSize="16">{formatEuro(maximum * fraction)}</text>
              </g>
            ))}
            <g clipPath={`url(#${clipId})`}>
              <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#1c577f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point) => <circle key={point.jahr} cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#1c577f" strokeWidth="2"><title>{point.jahr}: {formatEuro(point.umsatz)}</title></circle>)}
            </g>
            {points.map((point, index) => (years.length <= 5 || index === 0 || index === years.length - 1) && <text key={point.jahr} x={point.x} y="181" textAnchor="middle" fill="#637282" fontSize="16">{point.jahr}</text>)}
          </svg>
          <p className="ds-source">{sales.source} · Achse mit zwei Fingern oder +/− anpassen.</p>
        </figure>
      )}
      {mix.length > 0 && (
        <figure className="ds-chart">
          <figcaption>Produktgruppen</figcaption>
          <div className="ds-mix">
            <svg viewBox="0 0 160 160" role="img" aria-label={`Produktgruppen: ${mix.map((entry) => `${entry.name} ${entry.prozent} Prozent`).join(", ")}`}>
              <circle cx="80" cy="80" r="58" fill="none" stroke="#edf1f4" strokeWidth="23" />
              {mix.map((entry, index) => {
                const proportion = entry.prozent / total * 100;
                const start = mix.slice(0, index).reduce((sum, item) => sum + item.prozent, 0) / total * 100;
                return <circle key={entry.name} cx="80" cy="80" r="58" pathLength="100" fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="23" strokeDasharray={`${proportion} ${100 - proportion}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"><title>{entry.name}: {entry.prozent} %</title></circle>;
              })}
              <text x="80" y="78" textAnchor="middle" fill="#173750" fontSize="23" fontWeight="700">{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(total)} %</text>
              <text x="80" y="101" textAnchor="middle" fill="#637282" fontSize="16">Umsatzmix</text>
            </svg>
            <ul className="ds-mix-legend">
              {mix.map((entry, index) => <li key={entry.name}><span className="ds-legend-color" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" /><span>{entry.name}</span><strong>{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(entry.prozent)} %</strong></li>)}
            </ul>
          </div>
          <p className="ds-source">{sales.source}</p>
        </figure>
      )}
    </div>
  );
}
