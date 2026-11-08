"use client";

import Link from "next/link";
import { liveQuery } from "dexie";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { formatoCOP } from "@/lib/dinero";
import type { VisitaEnCola } from "@/lib/offline/cola";
import { enviarVisitaOffline } from "@/lib/offline/enviar";
import { descartarVisita, encolarVisita, listarVisitasEnCola, reintentarVisita, sincronizarVisitas } from "@/lib/offline/visitas";
import { ETIQUETA_RESULTADO, RESULTADOS_VISITA, type ResultadoVisita } from "@/lib/validaciones/ruta";

export interface Parada {
  clienteId: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  saldo: number;
  vencido: number;
  diasMora: number;
  visitado: boolean;
  resultado: string | null;
  ultimaVisita: string | null;
  ultimaCompra: string | null;
}

function suscribirConexion(aviso: () => void) {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

/** Pide la ubicación sin bloquear: si no hay permiso o señal en 6 s, la visita se registra sin ella. */
function obtenerUbicacion(): Promise<{ lat: number; lng: number; precision_m: number } | null> {
  return new Promise((resolver) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolver(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, precision_m: Math.round(p.coords.accuracy) }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  });
}

export function RutaDelDia({ paradas, fecha }: { paradas: Parada[]; fecha: string }) {
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const [cola, setCola] = useState<VisitaEnCola[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    try {
      await sincronizarVisitas(enviarVisitaOffline);
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    const inicial = setTimeout(() => void sincronizar(), 0);
    const alConectar = () => void sincronizar();
    window.addEventListener("online", alConectar);
    const id = setInterval(() => void sincronizar(), 30_000);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("online", alConectar);
      clearInterval(id);
    };
  }, [sincronizar]);

  useEffect(() => {
    const sub = liveQuery(() => listarVisitasEnCola()).subscribe({ next: setCola, error: () => setCola([]) });
    return () => sub.unsubscribe();
  }, []);

  const pendientes = cola.filter((v) => v.estado !== "rechazada");
  const rechazadas = cola.filter((v) => v.estado === "rechazada");
  const hechasLocal = new Map(cola.map((v) => [String(v.payload.cliente_id), String(v.payload.resultado)]));
  const visitadas = paradas.filter((p) => p.visitado || hechasLocal.has(p.clienteId)).length;
  const porCobrar = paradas.reduce((t, p) => t + p.saldo, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Visitas</p><p className="text-lg font-semibold tabular-nums">{visitadas} de {paradas.length}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Por cobrar en tu ruta</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(porCobrar)}</p></div>
      </div>

      {!enLinea || pendientes.length > 0 ? (
        <div className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${enLinea ? "bg-muted" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`} aria-live="polite">
          <span>{enLinea ? "Con internet" : "Sin internet: sigue visitando, se envía después"}{pendientes.length > 0 ? ` · ${pendientes.length} visita(s) por enviar` : ""}</span>
          {enLinea && pendientes.length > 0 ? <Button size="sm" variant="outline" disabled={sincronizando} onClick={() => void sincronizar()}>{sincronizando ? "Enviando…" : "Enviar ahora"}</Button> : null}
        </div>
      ) : null}
      {rechazadas.map((v) => (
        <div key={v.offlineId} role="alert" className="space-y-1.5 rounded-lg border border-destructive/50 p-3 text-sm">
          <p className="font-medium text-destructive">Una visita no se pudo registrar</p>
          <p className="text-muted-foreground">{v.ultimoError}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => { await reintentarVisita(v.offlineId); void sincronizar(); }}>Reintentar</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (window.confirm("¿Descartar esta visita?")) await descartarVisita(v.offlineId); }}>Descartar</Button>
          </div>
        </div>
      ))}

      {paradas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tienes clientes asignados para hoy. Pídele a tu administrador que arme tu ruta.</p>
      ) : (
        <ol className="space-y-3">
          {paradas.map((p, i) => {
            const local = hechasLocal.get(p.clienteId);
            const resultado = local ?? p.resultado;
            return (
              <li key={p.clienteId} className="space-y-2 rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.nombre}</p>
                    {p.direccion ? <p className="text-sm text-muted-foreground">{p.direccion}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {p.saldo > 0 ? <span className={p.vencido > 0 ? "font-medium text-destructive" : ""}>Debe {formatoCOP(p.saldo)}{p.vencido > 0 ? ` (vencido ${p.diasMora} días)` : ""}</span> : "Sin deuda"}
                      {p.ultimaCompra ? ` · última compra ${p.ultimaCompra}` : " · nunca ha comprado"}
                    </p>
                  </div>
                  {resultado ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{ETIQUETA_RESULTADO[resultado as ResultadoVisita] ?? resultado}{local ? " ⏳" : " ✔"}</span> : null}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link href={`/ventas/pos?cliente=${p.clienteId}`} className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">Vender</Link>
                  {p.saldo > 0 ? <Link href={`/clientes/${p.clienteId}`} className="rounded-lg border px-3 py-1.5">Cobrar</Link> : null}
                  {p.telefono ? <a href={`tel:${p.telefono}`} className="rounded-lg border px-3 py-1.5">Llamar</a> : null}
                  {p.direccion ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.direccion}, Colombia`)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5">Cómo llegar</a> : null}
                  <button type="button" className="rounded-lg border px-3 py-1.5" onClick={() => setAbierta(abierta === p.clienteId ? null : p.clienteId)}>Registrar visita</button>
                </div>
                {abierta === p.clienteId ? <FormularioVisita clienteId={p.clienteId} alGuardar={() => { setAbierta(null); void sincronizar(); }} /> : null}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Ruta del {fecha}. Las visitas se guardan en tu teléfono y se envían solas cuando hay internet.</p>
    </div>
  );
}

function FormularioVisita({ clienteId, alGuardar }: { clienteId: string; alGuardar: () => void }) {
  const [resultado, setResultado] = useState<ResultadoVisita | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!resultado) return setError("Elige cómo te fue en la visita");
    setError(null);
    setGuardando(true);
    try {
      const ubicacion = await obtenerUbicacion();
      await encolarVisita({
        offline_id: crypto.randomUUID(),
        cliente_id: clienteId,
        resultado,
        nota: nota.trim() || null,
        ...(ubicacion ?? {}),
        visitado_en: new Date().toISOString(),
      });
      alGuardar();
    } catch {
      setError("No pudimos guardar la visita en tu teléfono. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">¿Cómo te fue?</legend>
        {RESULTADOS_VISITA.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`res-${clienteId}`} className="size-4" checked={resultado === r} onChange={() => setResultado(r)} /> {ETIQUETA_RESULTADO[r]}
          </label>
        ))}
      </fieldset>
      <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} placeholder="Nota (opcional)" aria-label="Nota de la visita" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-11 w-full" disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar visita"}</Button>
      <p className="text-xs text-muted-foreground">Se guarda tu ubicación si el teléfono lo permite.</p>
    </div>
  );
}
