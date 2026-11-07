"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { EscanerCodigo } from "@/components/escaner-codigo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { variantesCodigo } from "@/lib/codigos";
import { formatoCOP, leerNumeroCO } from "@/lib/dinero";
import { totalCompra } from "@/lib/validaciones/compras";
import { crearCompra } from "../acciones";

export interface ProductoCompra {
  id: string;
  nombre: string;
  unidad_base: string;
  codigo_barras: string | null;
  presentaciones: { id: string; nombre: string; factor: number; codigo_barras: string | null }[];
}

interface PendienteIA {
  clave: string;
  descripcion: string;
  cantidad: string;
  costo: string;
}

interface RespuestaFactura {
  documentoId: string;
  proveedor_id: string | null;
  numero_factura: string | null;
  fecha: string | null;
  confianza: number;
  advertencias: string[];
  lineas: { productoId: string | null; descripcion: string; cantidad: number; costo_unitario: number }[];
}

interface Linea {
  clave: string;
  producto: ProductoCompra;
  presentacionId: string;
  cantidad: string;
  costo: string;
}

const clase = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function FormularioCompra({
  productos,
  proveedores,
  bodegas,
  hoy,
}: {
  productos: ProductoCompra[];
  proveedores: { id: string; nombre: string }[];
  bodegas: { id: string; nombre: string }[];
  hoy: string;
}) {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const [proveedor, setProveedor] = useState("");
  const [bodega, setBodega] = useState(bodegas[0]?.id ?? "");
  const [factura, setFactura] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [condicion, setCondicion] = useState<"contado" | "credito">("contado");
  const [diasCredito, setDiasCredito] = useState("30");
  const [documentoIa, setDocumentoIa] = useState<string | null>(null);
  const [pendientesIa, setPendientesIa] = useState<PendienteIA[]>([]);
  const [avisosIa, setAvisosIa] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);

  const leerFoto = async (archivo: File) => {
    setError(null);
    setLeyendo(true);
    try {
      const datos = new FormData();
      datos.set("foto", archivo);
      const resp = await fetch("/api/ia/factura", { method: "POST", body: datos });
      const json = (await resp.json()) as RespuestaFactura | { error: string };
      if (!resp.ok || "error" in json) {
        setError("error" in json ? json.error : "No pudimos leer la factura");
        return;
      }
      setDocumentoIa(json.documentoId);
      if (json.proveedor_id) setProveedor(json.proveedor_id);
      if (json.numero_factura) setFactura(json.numero_factura);
      if (json.fecha) setFecha(json.fecha);
      const nuevas: Linea[] = [];
      const sinPar: PendienteIA[] = [];
      for (const l of json.lineas) {
        const prod = l.productoId ? productos.find((p) => p.id === l.productoId) : undefined;
        if (prod)
          nuevas.push({
            clave: crypto.randomUUID(),
            producto: prod,
            presentacionId: "",
            cantidad: String(l.cantidad),
            costo: String(l.costo_unitario),
          });
        else
          sinPar.push({
            clave: crypto.randomUUID(),
            descripcion: l.descripcion,
            cantidad: String(l.cantidad),
            costo: String(l.costo_unitario),
          });
      }
      setLineas((ls) => [...ls, ...nuevas]);
      setPendientesIa(sinPar);
      setAvisosIa([
        ...(json.confianza < 0.6 ? ["La foto se leyó con poca seguridad: revisa todo con cuidado."] : []),
        ...json.advertencias,
      ]);
    } catch {
      setError("No pudimos leer la factura. Revisa tu conexión.");
    } finally {
      setLeyendo(false);
    }
  };

  const sugeridos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (t.length < 2) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 6);
  }, [busqueda, productos]);

  const agregarLinea = (p: ProductoCompra, cantidad = "1", costo = "", presentacionId = "") =>
    setLineas((ls) => [...ls, { clave: crypto.randomUUID(), producto: p, presentacionId, cantidad, costo }]);
  const agregar = (p: ProductoCompra, presentacionId = "") => agregarLinea(p, "1", "", presentacionId);

  const alEscanear = (codigo: string) => {
    const vs = variantesCodigo(codigo);
    for (const p of productos) {
      if (p.codigo_barras && vs.includes(p.codigo_barras)) return agregar(p);
      const pr = p.presentaciones.find((x) => x.codigo_barras && vs.includes(x.codigo_barras));
      if (pr) return agregar(p, pr.id);
    }
    setError(`No hay ningún producto con el código ${codigo}. Créalo primero en Productos.`);
  };

  const actualizar = (clave: string, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const leidas = lineas.map((l) => ({
    cantidad: leerNumeroCO(l.cantidad)?.toNumber() ?? 0,
    costo_unitario: leerNumeroCO(l.costo)?.toNumber() ?? 0,
  }));
  const total = totalCompra(leidas);

  const enviar = (confirmar: boolean) => {
    setError(null);
    setCampos({});
    iniciar(async () => {
      const r = await crearCompra(
        {
          proveedor_id: proveedor || null,
          bodega_id: bodega,
          numero_factura: factura,
          fecha,
          documento_ia_id: documentoIa,
          condicion_pago: condicion,
          dias_credito: Number(diasCredito) || 0,
          lineas: lineas.map((l, i) => ({
            producto_id: l.producto.id,
            presentacion_id: l.presentacionId || null,
            cantidad: leidas[i].cantidad,
            costo_unitario: leidas[i].costo_unitario,
          })),
        },
        confirmar,
      );
      if (r.ok) router.push(`/compras/${r.datos.id}`);
      else {
        setError(r.error);
        setCampos(r.campos ?? {});
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-dashed p-4">
        <Label htmlFor="foto-factura">Foto de la factura (la IA llena los productos)</Label>
        <Input
          id="foto-factura"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={leyendo}
          className="h-11"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leerFoto(f);
            e.target.value = "";
          }}
        />
        {leyendo ? (
          <p role="status" className="text-sm text-muted-foreground">
            Leyendo la factura… puede tardar unos segundos.
          </p>
        ) : null}
        {documentoIa ? (
          <p className="text-xs text-muted-foreground">
            La IA propone, tú confirmas: revisa cantidades y costos antes de guardar.
          </p>
        ) : null}
        {avisosIa.map((a) => (
          <p key={a} role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            {a}
          </p>
        ))}
      </div>

      {pendientesIa.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-500/50 p-3">
          <p className="text-sm font-medium">
            {pendientesIa.length} producto(s) de la factura no se encontraron en tu catálogo. Elige cuál es:
          </p>
          {pendientesIa.map((pi) => (
            <PendientePorElegir
              key={pi.clave}
              pendiente={pi}
              productos={productos}
              alElegir={(p) => {
                agregarLinea(p, pi.cantidad, pi.costo);
                setPendientesIa((x) => x.filter((y) => y.clave !== pi.clave));
              }}
              alDescartar={() => setPendientesIa((x) => x.filter((y) => y.clave !== pi.clave))}
            />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="proveedor">Proveedor</Label>
          <select id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={clase}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bodega">Recibe en</Label>
          <select id="bodega" value={bodega} onChange={(e) => setBodega(e.target.value)} className={clase}>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="factura">N.º de factura</Label>
          <Input id="factura" value={factura} onChange={(e) => setFactura(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="condicion">Pago</Label>
          <select id="condicion" value={condicion} onChange={(e) => setCondicion(e.target.value as "contado" | "credito")} className={clase}>
            <option value="contado">De contado</option>
            <option value="credito">A crédito (se queda debiendo)</option>
          </select>
        </div>
        {condicion === "credito" ? (
          <div className="space-y-1.5">
            <Label htmlFor="dias-credito">Días de crédito</Label>
            <Input id="dias-credito" inputMode="numeric" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className="h-11" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha</Label>
          <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="buscar">Agregar producto</Label>
        <div className="flex gap-2">
          <Input
            id="buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribe el nombre…"
            className="h-11"
          />
          <EscanerCodigo alLeer={alEscanear} etiqueta="Escanear" />
        </div>
        {sugeridos.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {sugeridos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    agregar(p);
                    setBusqueda("");
                  }}
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {lineas.length > 0 ? (
        <ul className="space-y-3">
          {lineas.map((l, i) => (
            <li key={l.clave} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{l.producto.nombre}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                >
                  Quitar
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Presentación"
                  value={l.presentacionId}
                  onChange={(e) => actualizar(l.clave, { presentacionId: e.target.value })}
                  className={clase}
                >
                  <option value="">{l.producto.unidad_base}</option>
                  {l.producto.presentaciones.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Cantidad"
                  inputMode="decimal"
                  value={l.cantidad}
                  onChange={(e) => actualizar(l.clave, { cantidad: e.target.value })}
                  className="h-11"
                />
                <Input
                  aria-label="Costo unitario"
                  inputMode="decimal"
                  placeholder="Costo $"
                  value={l.costo}
                  onChange={(e) => actualizar(l.clave, { costo: e.target.value })}
                  className="h-11"
                />
              </div>
              <p className="text-right text-sm text-muted-foreground tabular-nums">
                {formatoCOP(totalCompra([leidas[i]]))}
              </p>
              {campos[`lineas.${i}.costo_unitario`] || campos[`lineas.${i}.cantidad`] ? (
                <p className="text-xs text-destructive">
                  {campos[`lineas.${i}.cantidad`] ?? campos[`lineas.${i}.costo_unitario`]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Busca o escanea los productos que llegaron.
        </p>
      )}

      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatoCOP(total)}</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="h-12" disabled={pendiente || !lineas.length} onClick={() => enviar(false)}>
          Guardar borrador
        </Button>
        <Button type="button" className="h-12" disabled={pendiente || !lineas.length} onClick={() => enviar(true)}>
          {pendiente ? "Guardando…" : "Confirmar compra"}
        </Button>
      </div>
    </div>
  );
}

function PendientePorElegir({
  pendiente,
  productos,
  alElegir,
  alDescartar,
}: {
  pendiente: PendienteIA;
  productos: ProductoCompra[];
  alElegir: (p: ProductoCompra) => void;
  alDescartar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const sugeridos = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return t.length < 2 ? [] : productos.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 5);
  }, [texto, productos]);
  return (
    <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
      <p className="text-sm">
        <span className="font-medium">«{pendiente.descripcion}»</span> · {pendiente.cantidad} × ${pendiente.costo}
      </p>
      <div className="flex gap-2">
        <Input
          aria-label={`Buscar producto para ${pendiente.descripcion}`}
          placeholder="Buscar en tu catálogo…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="h-10"
        />
        <Button type="button" variant="ghost" size="sm" onClick={alDescartar}>
          Descartar
        </Button>
      </div>
      {sugeridos.map((p) => (
        <button
          key={p.id}
          type="button"
          className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => alElegir(p)}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  );
}
