"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { EscanerCodigo } from "@/components/escaner-codigo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type LineaCarrito,
  type ProductoPOS,
  agregarAlCarrito,
  buscarPorCodigo,
  buscarPorNombre,
  cambiarLinea,
  consumoPorProducto,
  quitarLinea,
  redondear3,
} from "@/lib/carrito";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { puedeFiar } from "@/lib/validaciones/clientes";
import { resumirPagos, totalVenta } from "@/lib/ventas";
import { cobrarVenta } from "./acciones";

export interface ClientePOS {
  id: string;
  nombre: string;
  telefono: string | null;
  cupo: number;
  saldo: number;
}

type Metodo = "efectivo" | "nequi" | "daviplata" | "transferencia" | "tarjeta" | "credito";
const METODOS: { valor: Metodo; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "nequi", etiqueta: "Nequi" },
  { valor: "daviplata", etiqueta: "Daviplata" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "credito", etiqueta: "Fiado" },
];

interface Recibo {
  numero: number;
  vuelto: string;
  total: number;
  duplicada: boolean;
}

export function PuntoDeVenta({
  bodegaId,
  catalogo,
  clientes,
  puedeAutorizarExceso,
}: {
  bodegaId: string;
  catalogo: ProductoPOS[];
  clientes: ClientePOS[];
  puedeAutorizarExceso: boolean;
}) {
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [pagos, setPagos] = useState<Record<Metodo, string>>({
    efectivo: "", nequi: "", daviplata: "", transferencia: "", tarjeta: "", credito: "",
  });
  const [clienteId, setClienteId] = useState("");
  const [descuento, setDescuento] = useState("");
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [excesoPendiente, setExcesoPendiente] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [pendiente, iniciar] = useTransition();
  // Identificador de esta venta: no cambia en los reintentos, así nunca se cobra dos veces.
  const ventaOfflineId = useRef(crypto.randomUUID());
  const campoBusqueda = useRef<HTMLInputElement>(null);

  const dto = leerNumeroCO(descuento)?.toNumber() ?? 0;
  const total = totalVenta(carrito.map((l) => ({ cantidad: l.cantidad, precio_unitario: l.precio, descuento: l.descuento })), dto);
  const sugeridos = useMemo(() => buscarPorNombre(catalogo, busqueda), [catalogo, busqueda]);
  const consumo = useMemo(() => consumoPorProducto(carrito), [carrito]);
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;

  const montos = METODOS.map((m) => ({ metodo: m.valor, monto: leerNumeroCO(pagos[m.valor])?.toNumber() ?? 0 }));
  const resumen = resumirPagos(total, montos);
  const aCredito = montos.find((m) => m.metodo === "credito")?.monto ?? 0;
  const sinCupo = !!cliente && aCredito > 0 && !puedeFiar(cliente.cupo, cliente.saldo, aCredito);

  const agregar = useCallback(
    (p: ProductoPOS, pres: ProductoPOS["presentaciones"][number] | null = null) => {
      setCarrito((c) => agregarAlCarrito(c, p, pres));
      setBusqueda("");
      setAviso(null);
      campoBusqueda.current?.focus();
    },
    [],
  );

  const alLeerCodigo = useCallback(
    (codigo: string) => {
      const r = buscarPorCodigo(catalogo, codigo);
      if (r) agregar(r.producto, r.presentacion);
      else setAviso(`No existe un producto con el código ${codigo}`);
    },
    [catalogo, agregar],
  );

  const reiniciar = () => {
    setCarrito([]);
    setPagos({ efectivo: "", nequi: "", daviplata: "", transferencia: "", tarjeta: "", credito: "" });
    setClienteId("");
    setDescuento("");
    setCobrando(false);
    setErrorCobro(null);
    setExcesoPendiente(false);
    setRecibo(null);
    ventaOfflineId.current = crypto.randomUUID();
  };

  const cobrar = (autorizar = false) => {
    setErrorCobro(null);
    iniciar(async () => {
      const r = await cobrarVenta({
        offline_id: ventaOfflineId.current,
        bodega_id: bodegaId,
        cliente_id: clienteId || null,
        descuento: dto,
        autorizar_exceso_cupo: autorizar,
        lineas: carrito.map((l) => ({
          producto_id: l.productoId,
          presentacion_id: l.presentacionId,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
          descuento: l.descuento,
        })),
        pagos: montos.filter((m) => m.monto > 0).map((m) => ({ metodo: m.metodo, monto: m.monto })),
      });
      if (r.ok) {
        setRecibo({ numero: r.datos.numero, vuelto: r.datos.vuelto, total: total.toNumber(), duplicada: r.datos.duplicada });
      } else {
        setExcesoPendiente(r.campos?.cupo === "excedido" && puedeAutorizarExceso);
        setErrorCobro(r.error);
      }
    });
  };

  // ---- Pantalla de venta terminada --------------------------------------------------
  if (recibo) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
        <p className="text-4xl" aria-hidden>✅</p>
        <h1 className="text-xl font-semibold">Venta #{recibo.numero} registrada</h1>
        <p className="text-2xl font-bold tabular-nums">{formatoCOP(recibo.total)}</p>
        {Number(recibo.vuelto) > 0 ? (
          <p className="rounded-xl bg-primary/10 p-4 text-lg font-semibold">
            Vuelto: {formatoCOP(recibo.vuelto)}
          </p>
        ) : null}
        {recibo.duplicada ? (
          <p className="text-sm text-muted-foreground">Esta venta ya estaba registrada; no se duplicó.</p>
        ) : null}
        <Button className="h-14 w-full text-base" onClick={reiniciar}>
          Nueva venta
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 pb-32">
      <h1 className="sr-only">Punto de venta</h1>

      {/* Búsqueda ---------------------------------------------------------------- */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            ref={campoBusqueda}
            autoFocus
            value={busqueda}
            aria-label="Buscar producto o escanear código"
            placeholder="Nombre o código de barras"
            className="h-12 text-base"
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              // Un lector USB/Bluetooth escribe el código y pulsa Enter.
              if (e.key !== "Enter" || !busqueda.trim()) return;
              e.preventDefault();
              const r = buscarPorCodigo(catalogo, busqueda);
              if (r) agregar(r.producto, r.presentacion);
              else if (sugeridos.length === 1) agregar(sugeridos[0]!);
              else setAviso("No encontramos ese producto");
            }}
          />
          <EscanerCodigo alLeer={alLeerCodigo} etiqueta="Cámara" />
        </div>
        {aviso ? (
          <p role="alert" className="text-sm text-destructive">
            {aviso}
          </p>
        ) : null}
        {sugeridos.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {sugeridos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted"
                  onClick={() => agregar(p)}
                >
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  {p.controlaStock ? (
                    <span className={`text-xs ${p.stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {p.stock <= 0 ? "Agotado" : `${p.stock} disp.`}
                    </span>
                  ) : null}
                  <span className="font-medium tabular-nums">{formatoCOP(p.precio)}</span>
                </button>
                {p.presentaciones.length > 0 ? (
                  <div className="flex flex-wrap gap-2 px-4 pb-3">
                    {p.presentaciones.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                        onClick={() => agregar(p, pr)}
                      >
                        {pr.nombre} · {formatoCOP(pr.precio)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Carrito ----------------------------------------------------------------- */}
      {carrito.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Escanea o busca un producto para empezar la venta.
        </p>
      ) : (
        <ul className="space-y-3">
          {carrito.map((l) => {
            const p = catalogo.find((x) => x.id === l.productoId);
            const excede = !!p?.controlaStock && (consumo.get(l.productoId) ?? 0) > p.stock;
            return (
              <li key={l.clave} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{l.nombre}</p>
                  <button
                    type="button"
                    aria-label={`Quitar ${l.nombre}`}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => setCarrito((c) => quitarLinea(c, l.clave))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Menos"
                    onClick={() => setCarrito((c) => cambiarLinea(c, l.clave, { cantidad: redondear3(l.cantidad - 1) }))}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    aria-label={`Cantidad de ${l.nombre}`}
                    inputMode="decimal"
                    className="h-10 w-20 text-center"
                    defaultValue={String(l.cantidad)}
                    key={l.cantidad}
                    onBlur={(e) => {
                      const n = leerNumeroCO(e.target.value)?.toNumber();
                      if (n !== undefined && n >= 0) setCarrito((c) => cambiarLinea(c, l.clave, { cantidad: redondear3(n) }));
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Más"
                    onClick={() => setCarrito((c) => cambiarLinea(c, l.clave, { cantidad: redondear3(l.cantidad + 1) }))}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <span className="ml-auto text-sm text-muted-foreground">×</span>
                  <Input
                    aria-label={`Precio de ${l.nombre}`}
                    inputMode="decimal"
                    className="h-10 w-28 text-right"
                    defaultValue={String(l.precio)}
                    key={`p${l.precio}`}
                    onBlur={(e) => {
                      const n = leerNumeroCO(e.target.value)?.toNumber();
                      if (n !== undefined && n >= 0) setCarrito((c) => cambiarLinea(c, l.clave, { precio: n }));
                    }}
                  />
                </div>
                {l.precio !== l.precioCatalogo ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Precio distinto al del catálogo ({formatoCOP(l.precioCatalogo)}). Queda registrado.
                  </p>
                ) : null}
                {excede ? (
                  <p className="text-xs text-destructive">Supera el stock disponible ({p?.stock}).</p>
                ) : null}
                <p className="text-right font-medium tabular-nums">
                  {formatoCOP(totalVenta([{ cantidad: l.cantidad, precio_unitario: l.precio, descuento: l.descuento }]))}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Panel de cobro ---------------------------------------------------------- */}
      {cobrando ? (
        <div className="space-y-4 rounded-xl border p-4">
          <h2 className="font-semibold">Cobrar {formatoCOP(total)}</h2>

          <div className="space-y-1.5">
            <label htmlFor="descuento" className="text-sm font-medium">Descuento general ($)</label>
            <Input id="descuento" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} className="h-11" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cliente" className="text-sm font-medium">Cliente {aCredito > 0 ? "(obligatorio para fiar)" : "(opcional)"}</label>
            <select
              id="cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Mostrador</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.saldo > 0 ? ` — debe ${formatoCOP(c.saldo)}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {METODOS.map((m) => (
              <div key={m.valor} className="space-y-1">
                <label htmlFor={`pago-${m.valor}`} className="text-xs text-muted-foreground">{m.etiqueta}</label>
                <Input
                  id={`pago-${m.valor}`}
                  inputMode="decimal"
                  className="h-11"
                  value={pagos[m.valor]}
                  onChange={(e) => setPagos((p) => ({ ...p, [m.valor]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPagos((p) => ({ ...p, efectivo: String(total.toNumber()) }))}>
              Efectivo exacto
            </Button>
            {[2000, 5000, 10000, 20000, 50000, 100000].map((b) => (
              <Button key={b} type="button" variant="outline" size="sm" onClick={() => setPagos((p) => ({ ...p, efectivo: String(b) }))}>
                {formatoCOP(b)}
              </Button>
            ))}
          </div>

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Recibido</dt><dd className="tabular-nums">{formatoCOP(resumen.recibido)}</dd></div>
            {resumen.vuelto.gt(0) ? (
              <div className="flex justify-between text-lg font-semibold text-primary"><dt>Vuelto</dt><dd className="tabular-nums">{formatoCOP(resumen.vuelto)}</dd></div>
            ) : null}
            {resumen.faltante.gt(0) ? (
              <div className="flex justify-between font-medium text-destructive"><dt>Falta</dt><dd className="tabular-nums">{formatoCOP(resumen.faltante)}</dd></div>
            ) : null}
            {resumen.faltante.isNegative() ? (
              <p className="text-destructive">El pago supera el total (solo el efectivo da vuelto).</p>
            ) : null}
          </dl>

          {sinCupo ? (
            <p role="alert" className="text-sm text-destructive">
              Este fiado supera el cupo de {cliente?.nombre}
              {puedeAutorizarExceso ? ". Como administrador puedes autorizarlo." : ". Pide autorización al dueño."}
            </p>
          ) : null}
          {errorCobro ? (
            <p role="alert" className="text-sm text-destructive">{errorCobro}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" className="h-12" onClick={() => setCobrando(false)}>
              Volver
            </Button>
            {excesoPendiente || (sinCupo && puedeAutorizarExceso) ? (
              <Button type="button" className="h-12" disabled={pendiente || !resumen.faltante.isZero()} onClick={() => cobrar(true)}>
                {pendiente ? "Cobrando…" : "Autorizar y cobrar"}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-12"
                disabled={pendiente || !resumen.faltante.isZero() || (sinCupo && !puedeAutorizarExceso)}
                onClick={() => cobrar(false)}
              >
                {pendiente ? "Cobrando…" : "Confirmar cobro"}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Barra de total fija ----------------------------------------------------- */}
      {!cobrando && carrito.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background p-3 md:bottom-0 md:left-64">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold tabular-nums">{formatoCOP(total)}</p>
            </div>
            <Button variant="outline" className="h-12" onClick={reiniciar}>
              Vaciar
            </Button>
            <Button className="h-12 px-8 text-base" onClick={() => setCobrando(true)}>
              Cobrar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
