import { DENOMINACIONES } from "@/lib/caja";
import { sumarDias } from "@/lib/fechas";
import { CATALOGO, CLIENTES_DEMO, PROVEEDORES_DEMO, PROVEEDOR_POR_CATEGORIA, type ProductoDemo } from "./catalogo";

/**
 * Generador determinista de datos de demo: una ferretería de Riohacha con N días de operación.
 * Produce SQL que usa las funciones REAL del sistema (confirmar_compra, confirmar_venta, cerrar_turno,
 * registrar_abono, anular_venta, verificar_comprobante), así el stock, los costos promedio, la cartera y la
 * caja quedan consistentes por construcción. Misma semilla → mismo SQL.
 */

export interface OpcionesDemo {
  /** Día "hoy" (AAAA-MM-DD, hora de Bogotá). */
  hoy: string;
  dias?: number;
  semilla?: number;
  /** true para Supabase real: crea la fila completa en auth.users/identities con contraseña. */
  authCompleto?: boolean;
}

export const DEMO = {
  correoDueno: "demo@surtix.co",
  correoVendedora: "maria@surtix.co",
  correoVendedor: "luis@surtix.co",
  contrasena: "Demo-Surtix-2026",
  negocio: "Ferretería El Puerto",
};

function prng(semilla: number) {
  let a = semilla >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    uuid: () => {
      const h = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16)).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
    },
  };
}

const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
const num = (n: number) => n.toFixed(2);
const cant = (n: number) => n.toFixed(3);
/** Redondeo a centavos como Postgres (mitad hacia arriba). */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Descompone un monto en billetes/monedas (para el conteo de cierre). */
function conteoDe(monto: number): Record<string, number> {
  const conteo: Record<string, number> = {};
  let resto = Math.round(monto);
  for (const d of DENOMINACIONES) {
    const n = Math.floor(resto / d);
    if (n > 0) conteo[String(d)] = n;
    resto -= n * d;
  }
  return conteo;
}

function diaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay();
}
const ts = (dia: string, h: number, min: number) =>
  `'${dia}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-05:00'::timestamptz`;

interface Estado {
  stock: Map<number, number>;
  saldo: Map<number, number>;
}

export function generarDemoSql(o: OpcionesDemo): { sql: string; resumen: Record<string, number> } {
  const dias = o.dias ?? 60;
  const r = prng(o.semilla ?? 2026);
  const S: string[] = [];
  const emit = (s: string) => S.push(s);

  const idDueno = r.uuid();
  const idMaria = r.uuid();
  const idLuis = r.uuid();
  const como = (id: string) => emit(`select set_config('request.jwt.claim.sub', '${id}', false);`);

  const productos = CATALOGO.map((p) => ({ ...p, id: r.uuid(), presId: p.presentacion ? r.uuid() : null }));
  const proveedores = PROVEEDORES_DEMO.map((p) => ({ ...p, id: r.uuid() }));
  const clientes = CLIENTES_DEMO.map(([nombre, telefono, cupo]) => ({ nombre, telefono, cupo, id: r.uuid() }));
  const ORG = "(select v from _demo where k = 'org')";
  const BOD = "(select v from _demo where k = 'bodega')";

  // ------------------------------------------------------------------ preparación
  emit("-- Datos de demo de Surtix (generado por scripts/generar-demo.ts). No editar a mano.");
  emit("create temp table _demo (k text primary key, v uuid);");
  if (o.authCompleto) {
    emit(`do $$ begin
  begin perform extensions.crypt('x', extensions.gen_salt('bf')); exception when others then null; end;
end $$;`);
  }
  const usuarios: [string, string, string][] = [
    [idDueno, DEMO.correoDueno, "Carlos Pérez"],
    [idMaria, DEMO.correoVendedora, "María Fernanda Brito"],
    [idLuis, DEMO.correoVendedor, "Luis Alberto Iguarán"],
  ];
  for (const [id, correo, nombre] of usuarios) {
    if (o.authCompleto) {
      emit(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(correo)},
  extensions.crypt(${q(DEMO.contrasena)}, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, ${q(JSON.stringify({ nombre }))}::jsonb, now(), now(), '', '', '', '');`);
      emit(`insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', ${q(correo)}, 'email_verified', true), 'email', now(), now(), now());`);
    } else {
      emit(`insert into auth.users (id, email) values ('${id}', ${q(correo)});`);
    }
  }

  como(idDueno);
  emit(`insert into _demo select 'org', crear_organizacion(${q(DEMO.negocio)}, 'ferreteria', 'Carlos Pérez');`);
  emit(`insert into _demo select 'bodega', id from bodegas where organizacion_id = ${ORG} and es_principal;`);
  emit(`insert into miembros (organizacion_id, usuario_id, rol, nombre) values
  (${ORG}, '${idMaria}', 'vendedor', 'María Fernanda Brito'),
  (${ORG}, '${idLuis}', 'vendedor', 'Luis Alberto Iguarán');`);

  const categorias = [...new Set(productos.map((p) => p.categoria))];
  emit(`insert into categorias (organizacion_id, nombre) values ${categorias.map((c) => `(${ORG}, ${q(c)})`).join(", ")}
  on conflict (organizacion_id, nombre) do nothing;`);

  for (const p of proveedores)
    emit(`insert into proveedores (id, organizacion_id, nombre, nit, telefono, contacto)
values ('${p.id}', ${ORG}, ${q(p.nombre)}, ${q(p.nit)}, ${q(p.telefono)}, ${q(p.contacto)});`);

  for (const p of productos) {
    emit(`insert into productos (id, organizacion_id, categoria_id, codigo_barras, nombre, unidad_base, precio_venta, stock_minimo)
values ('${p.id}', ${ORG}, (select id from categorias where organizacion_id = ${ORG} and nombre = ${q(p.categoria)}),
  ${p.barras ? q(p.barras) : "null"}, ${q(p.nombre)}, ${q(p.unidad)}, ${num(p.precio)}, ${cant(p.minimo)});`);
    if (p.presentacion && p.presId)
      emit(`insert into presentaciones (id, organizacion_id, producto_id, nombre, factor, precio_venta)
values ('${p.presId}', ${ORG}, '${p.id}', ${q(p.presentacion.nombre)}, ${cant(p.presentacion.factor)}, ${num(p.presentacion.precio)});`);
  }

  for (const c of clientes)
    emit(`insert into clientes (id, organizacion_id, nombre, telefono, cupo_credito)
values ('${c.id}', ${ORG}, ${q(c.nombre)}, ${q(c.telefono)}, ${num(c.cupo)});`);

  // ------------------------------------------------------------------ simulación día a día
  const est: Estado = { stock: new Map(), saldo: new Map() };
  productos.forEach((_, i) => est.stock.set(i, 0));
  clientes.forEach((_, i) => est.saldo.set(i, 0));
  const pesos = productos.map((p) => p.rotacion);
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const elegirProducto = () => {
    let x = r.next() * totalPeso;
    for (let i = 0; i < pesos.length; i++) {
      x -= pesos[i]!;
      if (x <= 0) return i;
    }
    return pesos.length - 1;
  };

  const conteos = { ventas: 0, compras: 0, abonos: 0, anuladas: 0, comprobantes: 0, sospechosos: 0 };
  const costoActual = productos.map((p) => p.costo);
  let nComprobante = 0;
  let ventaParaAnular: string | null = null;
  let referenciaRepetida: string | null = null;
  const fechasTurno: { id: string; abre: string; cierra: string | null }[] = [];
  const diasFaltante: Record<number, number> = {
    [Math.floor(dias * 0.2)]: -5000,
    [Math.floor(dias * 0.45)]: -12000,
    [Math.floor(dias * 0.7)]: -2000,
    [Math.floor(dias * 0.85)]: 1000,
  };
  const diaAnulacion = Math.floor(dias * 0.6);
  const diaRepetido = Math.floor(dias * 0.8);
  const diaMontoMalo = Math.floor(dias * 0.9);

  const compraDelDia = (dia: string, inicial: boolean) => {
    como(idDueno);
    const porProveedor = new Map<number, number[]>();
    productos.forEach((p, i) => {
      const proyectado = est.stock.get(i)! - p.rotacion * 7;
      if (inicial || proyectado < p.minimo) {
        const prov = PROVEEDOR_POR_CATEGORIA[p.categoria] ?? 0;
        porProveedor.set(prov, [...(porProveedor.get(prov) ?? []), i]);
      }
    });
    for (const [prov, idxs] of porProveedor) {
      const id = r.uuid();
      emit(`insert into compras (id, organizacion_id, proveedor_id, bodega_id, numero_factura, fecha, usuario_id)
values ('${id}', ${ORG}, '${proveedores[prov]!.id}', ${BOD}, ${q(`FV-${r.int(1000, 9999)}`)}, '${dia}', '${idDueno}');`);
      for (const i of idxs) {
        const p = productos[i]!;
        const q1 = Math.max(p.loteTipico * 2, Math.ceil(p.rotacion * (inicial ? 40 : 30)));
        costoActual[i] = Math.round(p.costo * (1 + (r.next() - 0.4) * 0.06) / 10) * 10;
        emit(`insert into compras_detalle (organizacion_id, compra_id, producto_id, cantidad, costo_unitario)
values (${ORG}, '${id}', '${p.id}', ${cant(q1)}, ${num(costoActual[i]!)});`);
        est.stock.set(i, r2(est.stock.get(i)! + q1));
      }
      emit(`select confirmar_compra('${id}');`);
      conteos.compras++;
    }
  };

  for (let d = 0; d < dias; d++) {
    const dia = sumarDias(o.hoy, -(dias - 1 - d));
    const esHoy = d === dias - 1;
    const dow = diaSemana(dia);
    const diaMes = Number(dia.slice(8, 10));

    if (d === 0) compraDelDia(dia, true);
    else if (d % 7 === 3) compraDelDia(dia, false);

    // Quién atiende hoy
    const vendedor = dow === 4 || dow === 0 ? idLuis : dow === 6 ? (d % 2 ? idLuis : idMaria) : idMaria;
    como(vendedor);
    const turno = r.uuid();
    emit(`insert into turnos_caja (id, organizacion_id, bodega_id, usuario_id, base_inicial)
values ('${turno}', ${ORG}, ${BOD}, '${vendedor}', 100000.00);`);
    let efectivoCaja = 100000;

    let nVentas = Math.round(
      22 * (dow === 6 ? 1.35 : dow === 0 ? 0.5 : 1) * (diaMes <= 2 || (diaMes >= 14 && diaMes <= 16) || diaMes >= 29 ? 1.25 : 1) *
        (0.8 + r.next() * 0.4),
    );
    if (esHoy) nVentas = Math.min(nVentas, 9); // hoy: el día apenas va por la mitad
    const horas = Array.from({ length: nVentas }, () => ({ h: r.int(7, esHoy ? 11 : 18), m: r.int(0, 59) })).sort(
      (a, b) => a.h * 60 + a.m - (b.h * 60 + b.m),
    );

    for (const { h, m } of horas) {
      const lineas: { i: number; qty: number; precio: number; presentacion?: boolean }[] = [];
      const nLineas = r.chance(0.35) ? 1 : r.chance(0.6) ? 2 : r.int(3, 4);
      for (let k = 0; k < nLineas; k++) {
        const i = elegirProducto();
        const p = productos[i]!;
        if (lineas.some((l) => l.i === i)) continue;
        const disp = est.stock.get(i)!;
        const decimales = p.unidad === "kilo" || p.unidad === "metro";
        let qty = Math.max(1, Math.round(p.loteTipico * (0.5 + r.next() * 1.5)));
        if (decimales && r.chance(0.2)) qty += 0.5;
        if (p.presentacion && r.chance(0.12)) {
          if (disp >= p.presentacion.factor) {
            lineas.push({ i, qty: 1, precio: p.presentacion.precio, presentacion: true });
            continue;
          }
        }
        if (disp < qty) qty = Math.floor(disp * 2) / 2;
        if (qty <= 0) continue;
        const rebaja = r.chance(0.025);
        lineas.push({ i, qty, precio: rebaja ? Math.round((p.precio * 0.93) / 100) * 100 : p.precio });
      }
      if (!lineas.length) continue;

      const venta = r.uuid();
      const total = r2(lineas.reduce((s, l) => s + r2(l.qty * l.precio), 0));
      const conCliente = r.chance(0.3);
      const ci = conCliente ? r.int(0, clientes.length - 1) : -1;
      const cli = ci >= 0 ? clientes[ci]! : null;

      type Pago = { metodo: string; monto: number };
      let pagos: Pago[];
      const x = r.next();
      if (cli && cli.cupo > 0 && x > 0.78 && est.saldo.get(ci)! + total <= cli.cupo) {
        pagos = [{ metodo: "credito", monto: total }];
      } else if (x < 0.56) pagos = [{ metodo: "efectivo", monto: total }];
      else if (x < 0.68 && total > 20000) {
        const mitad = r2(Math.floor(total / 2000) * 1000);
        pagos = [{ metodo: "efectivo", monto: mitad }, { metodo: "nequi", monto: r2(total - mitad) }];
      } else if (x < 0.8) pagos = [{ metodo: "nequi", monto: total }];
      else if (x < 0.86) pagos = [{ metodo: "daviplata", monto: total }];
      else if (x < 0.92) pagos = [{ metodo: "tarjeta", monto: total }];
      else pagos = [{ metodo: "efectivo", monto: total }];

      const cuando = ts(dia, h, m);
      emit(`insert into ventas (id, organizacion_id, bodega_id, cliente_id, turno_id, usuario_id, offline_id, creado_en)
values ('${venta}', ${ORG}, ${BOD}, ${cli ? `'${cli.id}'` : "null"}, '${turno}', '${vendedor}', '${r.uuid()}', ${cuando});`);
      for (const l of lineas) {
        const p = productos[l.i]!;
        emit(`insert into ventas_detalle (organizacion_id, venta_id, producto_id, presentacion_id, cantidad, precio_unitario)
values (${ORG}, '${venta}', '${p.id}', ${l.presentacion ? `'${p.presId}'` : "null"}, ${cant(l.qty)}, ${num(l.precio)});`);
        est.stock.set(l.i, r2(est.stock.get(l.i)! - l.qty * (l.presentacion ? p.presentacion!.factor : 1)));
      }

      // Comprobantes de los pagos electrónicos
      const comps: { metodo: string; id: string; monto: number; leido: number; ref: string }[] = [];
      for (const pg of pagos) {
        if (!["nequi", "daviplata"].includes(pg.metodo)) continue;
        nComprobante++;
        const malo = d === diaMontoMalo && comps.length === 0 && conteos.sospechosos === 0 && pg.monto >= 15000;
        const repetido: boolean = d === diaRepetido && referenciaRepetida !== null && pg.monto >= 10000 && !comps.length;
        const ref: string = repetido ? referenciaRepetida! : `${pg.metodo === "nequi" ? "M" : "D"}${String(4_000_000 + nComprobante * 37)}`;
        const leido = malo ? Math.max(1000, pg.monto - 10000) : pg.monto;
        const id = r.uuid();
        emit(`insert into comprobantes (id, organizacion_id, imagen_url, hash_imagen, referencia, entidad, monto_leido, fecha_leida, nombre_leido, confianza)
values ('${id}', ${ORG}, ${q(`demo/comprobantes/${id}.jpg`)}, ${q(r.uuid().replace(/-/g, ""))}, ${q(ref)}, ${q(pg.metodo)}, ${num(leido)}, ${cuando}, ${q(cli?.nombre ?? "Cliente")}, 0.96);`);
        if (!referenciaRepetida && pg.monto >= 10000 && d > dias * 0.3 && d < dias * 0.6) referenciaRepetida = ref;
        comps.push({ metodo: pg.metodo, id, monto: pg.monto, leido, ref });
        conteos.comprobantes++;
      }
      for (const pg of pagos) {
        const c = comps.find((x2) => x2.metodo === pg.metodo);
        emit(`insert into pagos_venta (organizacion_id, venta_id, metodo, monto, comprobante_id)
values (${ORG}, '${venta}', '${pg.metodo}', ${num(pg.monto)}, ${c ? `'${c.id}'` : "null"});`);
      }
      emit(`select confirmar_venta('${venta}');`);
      conteos.ventas++;

      for (const c of comps) {
        const sosp = c.leido !== c.monto || (c.ref === referenciaRepetida && d >= diaRepetido);
        if (sosp) conteos.sospechosos++;
        emit(`select marcar_verificacion_pago(pv.id, verificar_comprobante('${c.id}', ${num(c.monto)}, pv.id))
  from pagos_venta pv where pv.venta_id = '${venta}' and pv.comprobante_id = '${c.id}';`);
      }
      const cambios = lineas
        .filter((l) => !l.presentacion && l.precio !== productos[l.i]!.precio)
        .map((l) => ({ producto_id: productos[l.i]!.id, precio_catalogo: productos[l.i]!.precio, precio_cobrado: l.precio }));
      if (cambios.length)
        emit(`select registrar_cambio_precio('${venta}', ${q(JSON.stringify(cambios))}::jsonb);`);

      if (cli) for (const pg of pagos) if (pg.metodo === "credito") est.saldo.set(ci, r2(est.saldo.get(ci)! + pg.monto));

      const anular = d === diaAnulacion && !ventaParaAnular && pagos.length === 1 && pagos[0]!.metodo === "efectivo" && total > 30000;
      if (anular) {
        ventaParaAnular = venta;
        // El dueño la anula el mismo día: devuelve inventario y no cuenta en el efectivo esperado.
        como(idDueno);
        emit(`select anular_venta('${venta}', 'Cliente devolvió el pedido completo: producto equivocado');`);
        como(vendedor);
        conteos.anuladas++;
        conteos.ventas--;
        for (const l of lineas)
          est.stock.set(l.i, r2(est.stock.get(l.i)! + l.qty * (l.presentacion ? productos[l.i]!.presentacion!.factor : 1)));
        continue;
      }
      efectivoCaja = r2(efectivoCaja + pagos.filter((p2) => p2.metodo === "efectivo").reduce((s, p2) => s + p2.monto, 0));
    }

    // Abonos de clientes con deuda
    for (let ci = 0; ci < clientes.length; ci++) {
      const saldo = est.saldo.get(ci)!;
      if (saldo <= 0 || !r.chance(0.12) || esHoy) continue;
      const monto = r.chance(0.5) ? saldo : Math.min(saldo, Math.max(20000, Math.round((saldo * 0.5) / 1000) * 1000));
      const metodo = r.chance(0.6) ? "efectivo" : "nequi";
      emit(`select registrar_abono('${clientes[ci]!.id}', ${num(monto)}, '${metodo}', '${turno}');`);
      est.saldo.set(ci, r2(saldo - monto));
      if (metodo === "efectivo") efectivoCaja = r2(efectivoCaja + monto);
      conteos.abonos++;
    }

    // Cierre de caja (hoy queda abierta, para poder vender en la demo)
    if (!esHoy) {
      const ajuste = diasFaltante[d] ?? 0;
      const contado = Math.round(efectivoCaja + ajuste);
      emit(`select cerrar_turno('${turno}', ${num(contado)}, ${q(JSON.stringify(conteoDe(contado)))}::jsonb);`);
      fechasTurno.push({ id: turno, abre: ts(dia, 7, 10), cierra: ts(dia, 19, 5) });
    } else fechasTurno.push({ id: turno, abre: ts(dia, 7, 10), cierra: null });
  }

  // ------------------------------------------------------------------ fechas reales y limpieza
  como(idDueno);
  emit("-- Fechas reales de los movimientos, turnos y abonos (los documentos son inmutables salvo con bypass interno).");
  emit("set session_replication_role = replica;");
  emit(`update movimientos_inventario m set creado_en = v.creado_en
  from ventas v where m.documento_tipo = 'venta' and m.documento_id = v.id and m.tipo = 'venta';`);
  emit(`update movimientos_inventario m set creado_en = v.creado_en + interval '3 hours'
  from ventas v where m.documento_tipo = 'venta' and m.documento_id = v.id and m.tipo = 'anulacion_entrada';`);
  emit(`update ventas set anulada_en = creado_en + interval '3 hours' where estado = 'anulado';`);
  emit(`update movimientos_inventario m set creado_en = ((c.fecha + time '08:00') at time zone 'America/Bogota')
  from compras c where m.documento_tipo = 'compra' and m.documento_id = c.id;`);
  emit(`update compras set creado_en = ((fecha + time '08:00') at time zone 'America/Bogota');`);
  for (const t of fechasTurno)
    emit(`update turnos_caja set abierto_en = ${t.abre}${t.cierra ? `, cerrado_en = ${t.cierra}` : ""} where id = '${t.id}';`);
  emit(`update abonos_cliente a set creado_en = coalesce((select abierto_en + interval '6 hours' from turnos_caja t where t.id = a.turno_id), a.creado_en);`);
  emit(`update comprobantes c set creado_en = coalesce((select pv.creado_en from pagos_venta pv where pv.comprobante_id = c.id limit 1), c.creado_en);`);
  emit(`update pagos_venta pv set creado_en = v.creado_en from ventas v where v.id = pv.venta_id;`);
  emit("delete from eventos_outbox;"); // los eventos de la demo no deben disparar automatizaciones reales
  emit("set session_replication_role = origin;");
  emit("select set_config('request.jwt.claim.sub', '', false);");
  emit("drop table _demo;");

  return {
    sql: S.join("\n") + "\n",
    resumen: { ...conteos, productos: productos.length, clientes: clientes.length, proveedores: proveedores.length },
  };
}

export type { ProductoDemo };
