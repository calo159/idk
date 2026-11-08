"use client";

import { useState } from "react";
import { type ProductoCatalogo, agruparPorCategoria, enlacePedidoWhatsApp, textoPedido, totalPedido } from "@/lib/catalogo";
import { formatoCOP } from "@/lib/dinero";
import { normalizarTexto } from "@/lib/validaciones/ia";

export function Catalogo({ negocio, telefono, mensaje, productos }: { negocio: string; telefono: string; mensaje: string | null; productos: ProductoCatalogo[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const q = normalizarTexto(busqueda);
  const visibles = q ? productos.filter((p) => q.split(" ").every((w) => normalizarTexto(`${p.nombre} ${p.categoria ?? ""}`).includes(w))) : productos;
  const lineas = productos.filter((p) => (cantidades[p.id] ?? 0) > 0).map((p) => ({ producto: p, cantidad: cantidades[p.id]! }));
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
  const cambiar = (id: string, delta: number) => setCantidades((c) => ({ ...c, [id]: Math.min(Math.max((c[id] ?? 0) + delta, 0), 999) }));
  const enlace = lineas.length ? enlacePedidoWhatsApp(telefono, textoPedido(negocio, lineas)) : null;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{negocio}</h1>
        {mensaje ? <p className="text-sm text-muted-foreground">{mensaje}</p> : null}
        <p className="text-xs text-muted-foreground">Elige tus productos y envía el pedido por WhatsApp. El negocio te confirma el total y la entrega.</p>
      </header>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto"
        aria-label="Buscar producto"
        className="mt-4 h-12 w-full rounded-xl border border-input bg-background px-4 text-base"
      />

      {visibles.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{productos.length === 0 ? "Este catálogo aún no tiene productos." : "No encontramos ese producto."}</p>
      ) : (
        agruparPorCategoria(visibles).map((g) => (
          <section key={g.categoria} className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.categoria}</h2>
            <ul className="divide-y rounded-xl border">
              {g.productos.map((p) => {
                const n = cantidades[p.id] ?? 0;
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.nombre}</span>
                      {p.descripcion ? <span className="block truncate text-xs text-muted-foreground">{p.descripcion}</span> : null}
                      <span className="block text-sm tabular-nums">
                        {p.precioAntes !== null ? <s className="mr-1.5 text-xs text-muted-foreground">{formatoCOP(p.precioAntes)}</s> : null}
                        <strong>{formatoCOP(p.precio)}</strong>
                        <span className="text-xs text-muted-foreground"> / {p.unidad}</span>
                        {p.precioAntes !== null ? <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Oferta</span> : null}
                      </span>
                      {!p.disponible ? <span className="block text-xs text-destructive">Agotado por ahora — pregunta si llega pronto</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {n > 0 ? (
                        <>
                          <button type="button" aria-label={`Quitar uno de ${p.nombre}`} onClick={() => cambiar(p.id, -1)} className="size-10 rounded-full border text-lg">−</button>
                          <span className="w-6 text-center tabular-nums" aria-live="polite">{n}</span>
                        </>
                      ) : null}
                      <button type="button" aria-label={`Agregar ${p.nombre}`} onClick={() => cambiar(p.id, 1)} className="size-10 rounded-full bg-primary text-lg text-primary-foreground">+</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {lineas.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <span className="text-sm">
              <span className="block font-medium">{unidades} producto(s)</span>
              <span className="block text-xs text-muted-foreground">Aprox. {formatoCOP(totalPedido(lineas))}</span>
            </span>
            {enlace ? (
              <a href={enlace} target="_blank" rel="noreferrer" className="ml-auto rounded-xl bg-primary px-5 py-3 text-center font-medium text-primary-foreground">
                Pedir por WhatsApp
              </a>
            ) : (
              <span className="ml-auto text-xs text-destructive">Este negocio aún no tiene WhatsApp para pedidos.</span>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
