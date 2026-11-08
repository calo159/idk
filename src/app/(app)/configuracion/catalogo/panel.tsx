"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sugerirSlug } from "@/lib/catalogo";
import { cambiarVisibilidad, guardarCatalogo } from "./acciones";

export function FormularioCatalogo({ inicial, nombreNegocio, origen }: { inicial: { activo: boolean; slug: string; telefono: string; mensaje: string }; nombreNegocio: string; origen: string }) {
  const [activo, setActivo] = useState(inicial.activo);
  const [slug, setSlug] = useState(inicial.slug || sugerirSlug(nombreNegocio));
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [mensaje, setMensaje] = useState(inicial.mensaje);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [guardado, setGuardado] = useState(inicial.activo && !!inicial.slug);
  const url = `${origen}/catalogo/${slug.trim().toLowerCase()}`;
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await guardarCatalogo({ activo, slug, telefono, mensaje });
          setAviso(r.ok ? { ok: true, texto: "Guardado" } : { ok: false, texto: r.error });
          if (r.ok) setGuardado(activo);
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Catálogo público activo
      </label>
      <div className="space-y-1">
        <label htmlFor="cs" className="text-xs">Dirección de tu catálogo</label>
        <Input id="cs" className="h-11" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" spellCheck={false} />
        <p className="break-all text-xs text-muted-foreground">{url}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="ct" className="text-xs">WhatsApp donde recibes los pedidos</label>
        <Input id="ct" inputMode="tel" className="h-11" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="3001234567" />
      </div>
      <div className="space-y-1">
        <label htmlFor="cm" className="text-xs">Mensaje de bienvenida (opcional)</label>
        <Input id="cm" className="h-11" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={200} placeholder="Domicilios en Riohacha, lunes a sábado" />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
      {aviso ? <p role={aviso.ok ? "status" : "alert"} className={`text-sm ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</p> : null}
      {guardado ? (
        <div className="flex gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border px-3 py-2 text-center text-sm">Ver mi catálogo</a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Mira nuestro catálogo: ${url}`)}`} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border px-3 py-2 text-center text-sm">Compartir</a>
        </div>
      ) : null}
    </form>
  );
}

export function ListaVisibilidad({ productos }: { productos: { id: string; nombre: string; visible: boolean }[] }) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const aplicar = (publicar: boolean) =>
    iniciar(async () => {
      const r = await cambiarVisibilidad({ ids: [...elegidos], publicar });
      setAviso(r.ok ? (publicar ? "Productos publicados" : "Productos ocultos") : r.error);
      if (r.ok) setElegidos(new Set());
    });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-medium">Productos del catálogo</h2>
        <Button size="sm" variant="outline" disabled={pendiente || elegidos.size === 0} onClick={() => aplicar(false)}>Ocultar</Button>
        <Button size="sm" variant="outline" disabled={pendiente || elegidos.size === 0} onClick={() => aplicar(true)}>Publicar</Button>
      </div>
      {aviso ? <p role="status" className="text-xs text-muted-foreground">{aviso}</p> : null}
      <ul className="max-h-96 divide-y overflow-y-auto rounded-xl border text-sm">
        {productos.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 px-4 py-2.5">
              <input type="checkbox" className="size-4" checked={elegidos.has(p.id)} onChange={(e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
              <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              <span className={`text-xs ${p.visible ? "text-primary" : "text-muted-foreground"}`}>{p.visible ? "Visible" : "Oculto"}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
