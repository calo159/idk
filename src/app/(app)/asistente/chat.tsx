"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Mensaje {
  rol: "usuario" | "asistente";
  texto: string;
}

export function Chat({ ejemplos }: { ejemplos: string[] }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  const preguntar = async (pregunta: string) => {
    const p = pregunta.trim();
    if (p.length < 2 || pensando) return;
    const historial = mensajes.slice(-6);
    setMensajes((m) => [...m, { rol: "usuario", texto: p }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await fetch("/api/ia/consulta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pregunta: p, historial }),
      });
      const j = (await r.json().catch(() => ({}))) as { respuesta?: string; error?: string };
      setMensajes((m) => [...m, { rol: "asistente", texto: j.respuesta ?? j.error ?? "No pude responder ahora. Intenta de nuevo." }]);
    } catch {
      setMensajes((m) => [...m, { rol: "asistente", texto: "No hay conexión. Revisa tu internet e intenta de nuevo." }]);
    } finally {
      setPensando(false);
      setTimeout(() => fin.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  return (
    <div className="space-y-4">
      {mensajes.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Prueba con una de estas:</p>
          <div className="flex flex-wrap gap-2">
            {ejemplos.map((e) => (
              <button key={e} type="button" onClick={() => preguntar(e)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted">
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {mensajes.map((m, i) => (
            <li key={i} className={m.rol === "usuario" ? "ml-10 rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "mr-6 whitespace-pre-line rounded-2xl border px-4 py-2.5 text-sm"}>
              {m.texto}
            </li>
          ))}
          {pensando ? <li className="mr-6 rounded-2xl border px-4 py-2.5 text-sm text-muted-foreground">Consultando tus datos…</li> : null}
        </ul>
      )}
      <div ref={fin} />
      <form
        className="sticky bottom-20 flex gap-2 bg-background pt-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void preguntar(texto);
        }}
      >
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder="Pregunta sobre tu negocio" aria-label="Tu pregunta" className="h-12 flex-1" />
        <Button type="submit" className="h-12" disabled={pensando || texto.trim().length < 2}>Preguntar</Button>
      </form>
      <p className="text-xs text-muted-foreground">El asistente solo consulta: no cambia nada en tu negocio. Revisa las cifras importantes en Reportes.</p>
    </div>
  );
}
