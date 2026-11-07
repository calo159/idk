"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerNumeroCO } from "@/lib/dinero";
import { combinarVariantes, listaDesdeTexto } from "@/lib/validaciones/avanzado";
import { crearLista, crearVariantes, fijarPrecioLista, registrarLote, registrarSeriales } from "./acciones";

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormLista() {
  const [estado, accion, pendiente] = useActionState(crearLista, null);
  return (
    <form action={accion} className="space-y-2 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Nueva lista de precios</h2>
      <Input name="nombre" aria-label="Nombre de la lista" placeholder="Ej. Mayorista, Constructores" className="h-11" />
      <Input name="descripcion" aria-label="Descripción" placeholder="Descripción (opcional)" className="h-11" />
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.campos?.nombre ?? estado.error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Creando…" : "Crear lista"}</Button>
    </form>
  );
}

export function EditorPrecios({ listaId, productos, precios }: { listaId: string; productos: { id: string; nombre: string; precio: number }[]; precios: Record<string, number> }) {
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(precios).map(([k, v]) => [k, String(v)])));
  const [estado, setEstado] = useState<Record<string, "ok" | "error">>({});
  const [filtro, setFiltro] = useState("");
  const visibles = productos.filter((p) => p.nombre.toLowerCase().includes(filtro.trim().toLowerCase())).slice(0, 60);
  return (
    <div className="space-y-2">
      <Input aria-label="Buscar producto" placeholder="Buscar producto…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-11" />
      <ul className="divide-y rounded-xl border text-sm">
        {visibles.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate">{p.nombre}<span className="block text-xs text-muted-foreground">Normal: ${p.precio.toLocaleString("es-CO")}</span></span>
            <Input aria-label={`Precio de ${p.nombre} en esta lista`} inputMode="decimal" className="h-10 w-28 text-right" placeholder="= normal" value={valores[p.id] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
              onBlur={async (e) => {
                if (e.target.value.trim() === "") return;
                const r = await fijarPrecioLista({ lista_id: listaId, producto_id: p.id, precio: e.target.value });
                setEstado((s) => ({ ...s, [p.id]: r.ok ? "ok" : "error" }));
              }} />
            <span className="w-4 text-center" aria-live="polite">{estado[p.id] === "ok" ? "✓" : estado[p.id] === "error" ? "⚠" : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormVariantes({ productoId }: { productoId: string }) {
  const [tallas, setTallas] = useState("");
  const [colores, setColores] = useState("");
  const [otro, setOtro] = useState("");
  const [nombreOtro, setNombreOtro] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const n = combinarVariantes({ talla: listaDesdeTexto(tallas), color: listaDesdeTexto(colores), ...(otro.trim() && nombreOtro.trim() ? { [nombreOtro.trim().toLowerCase()]: listaDesdeTexto(otro) } : {}) }).length;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Variantes (talla, color…)</h2>
      <p className="text-xs text-muted-foreground">Cada combinación queda como un producto con su propio stock, precio y código de barras.</p>
      <Input aria-label="Tallas" placeholder="Tallas: S, M, L, XL" value={tallas} onChange={(e) => setTallas(e.target.value)} className="h-11" />
      <Input aria-label="Colores" placeholder="Colores: Rojo, Azul" value={colores} onChange={(e) => setColores(e.target.value)} className="h-11" />
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="Otra opción" placeholder="Otra opción (ej. Material)" value={nombreOtro} onChange={(e) => setNombreOtro(e.target.value)} className="h-11" />
        <Input aria-label="Valores de la otra opción" placeholder="Valores separados por coma" value={otro} onChange={(e) => setOtro(e.target.value)} className="h-11" />
      </div>
      <Button className="h-11 w-full" disabled={pendiente || n === 0} onClick={() =>
        iniciar(async () => {
          const r = await crearVariantes(productoId, tallas, colores, otro, nombreOtro);
          setMensaje({ ok: r.ok, texto: r.ok ? `${r.datos.creadas} variante(s) creadas.` : r.error });
        })}>
        {pendiente ? "Creando…" : n > 0 ? `Crear ${n} variante(s)` : "Crear variantes"}
      </Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}

export function FormLote({ productos, bodegas }: { productos: { id: string; nombre: string }[]; bodegas: { id: string; nombre: string }[] }) {
  const [producto, setProducto] = useState(productos[0]?.id ?? "");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [codigo, setCodigo] = useState("");
  const [vence, setVence] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Registrar lote</h2>
      <select aria-label="Producto" value={producto} onChange={(e) => setProducto(e.target.value)} className={clase}>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="lote-cod">Código del lote</Label><Input id="lote-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="lote-cant">Cantidad</Label><Input id="lote-cant" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="lote-vence">Vence</Label><Input id="lote-vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="lote-bod">Bodega</Label><select id="lote-bod" value={bodega} onChange={(e) => setBodega(e.target.value)} className={clase}>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>
      </div>
      <Button className="h-11 w-full" disabled={pendiente || !producto} onClick={() =>
        iniciar(async () => {
          const r = await registrarLote({ producto_id: producto, bodega_id: bodega, codigo, vence, cantidad: leerNumeroCO(cantidad)?.toNumber() ?? 0 });
          setMensaje({ ok: r.ok, texto: r.ok ? "Lote registrado." : r.error });
        })}>
        {pendiente ? "Guardando…" : "Registrar lote"}
      </Button>
      {mensaje ? <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-primary" : "text-destructive"}`}>{mensaje.texto}</p> : null}
    </div>
  );
}

export function FormSeriales({ productos, bodegas }: { productos: { id: string; nombre: string }[]; bodegas: { id: string; nombre: string }[] }) {
  const [estado, accion, pendiente] = useActionState(registrarSeriales, null);
  return (
    <form action={accion} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Registrar seriales</h2>
      <select name="producto_id" aria-label="Producto" className={clase}>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
      <select name="bodega_id" aria-label="Bodega" className={clase}>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
      <textarea name="texto" aria-label="Seriales" rows={4} placeholder="Un serial por línea (o separados por coma)" className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
      {estado && !estado.ok ? <p role="alert" className="text-sm text-destructive">{estado.error}</p> : null}
      {estado?.ok ? <p role="status" className="text-sm text-primary">{estado.datos.n} serial(es) registrados.</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>{pendiente ? "Guardando…" : "Registrar seriales"}</Button>
    </form>
  );
}
