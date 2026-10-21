import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement, overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]),input,select,a[href],[tabindex='0']") ?? [])];
    const timer = setTimeout(() => (ref.current?.querySelector<HTMLElement>("input") ?? focusables()[0])?.focus(), 60);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); if (e.key === "Tab") { const f = focusables(); if (!f.length) return; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1)?.focus(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0]?.focus(); } } };
    document.addEventListener("keydown", key); return () => { clearTimeout(timer); document.body.style.overflow = overflow; document.removeEventListener("keydown", key); prior?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}><div className="sheet-handle" /><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Schließen" onClick={onClose}><Icon name="close" /></button></div>{children}</div></div>;
}
