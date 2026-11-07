/**
 * Permisos por rol para la INTERFAZ (mostrar u ocultar botones). La autoridad real es siempre la base
 * de datos (RLS + funciones SQL); un test compara esta tabla con `roles_escritura()` para que no diverjan.
 */
export type Rol = "dueno" | "admin" | "vendedor" | "bodeguero" | "contador" | "ruta";

export const ROLES: { valor: Rol; etiqueta: string; descripcion: string }[] = [
  { valor: "dueno", etiqueta: "Dueño", descripcion: "Ve y controla todo" },
  {
    valor: "admin",
    etiqueta: "Administrador",
    descripcion: "Productos, precios, usuarios y anulaciones",
  },
  { valor: "vendedor", etiqueta: "Vendedor", descripcion: "Vende, cobra y maneja su caja" },
  { valor: "bodeguero", etiqueta: "Bodeguero", descripcion: "Recibe mercancía, compras y ajustes" },
  { valor: "contador", etiqueta: "Contador", descripcion: "Solo consulta y exporta" },
  { valor: "ruta", etiqueta: "Vendedor de ruta", descripcion: "Pedidos y cobros en campo" },
];

export const etiquetaRol = (r: string) => ROLES.find((x) => x.valor === r)?.etiqueta ?? r;

/** Mismas listas que `roles_escritura(tabla)` en la migración 0003. */
export const ESCRITURA: Record<string, Rol[]> = {
  bodegas: ["dueno", "admin"],
  categorias: ["dueno", "admin", "bodeguero"],
  productos: ["dueno", "admin", "bodeguero"],
  presentaciones: ["dueno", "admin", "bodeguero"],
  proveedores: ["dueno", "admin", "bodeguero"],
  compras: ["dueno", "admin", "bodeguero"],
  compras_detalle: ["dueno", "admin", "bodeguero"],
  clientes: ["dueno", "admin", "vendedor", "ruta"],
  turnos_caja: ["dueno", "admin", "vendedor", "ruta"],
  ventas: ["dueno", "admin", "vendedor", "ruta"],
  ventas_detalle: ["dueno", "admin", "vendedor", "ruta"],
  pagos_venta: ["dueno", "admin", "vendedor", "ruta"],
  comprobantes: ["dueno", "admin", "vendedor", "ruta", "bodeguero"],
  documentos_ia: ["dueno", "admin", "vendedor", "bodeguero"],
};

/** Acciones de negocio (funciones SQL) y quién puede ejecutarlas. */
export const ACCIONES: Record<string, Rol[]> = {
  "ventas.confirmar": ["dueno", "admin", "vendedor", "ruta"],
  "ventas.anular": ["dueno", "admin"],
  "compras.confirmar": ["dueno", "admin", "bodeguero"],
  "compras.anular": ["dueno", "admin"],
  "inventario.ajustar": ["dueno", "admin", "bodeguero"],
  "abonos.registrar": ["dueno", "admin", "vendedor", "ruta"],
  "usuarios.gestionar": ["dueno", "admin"],
  "configuracion.editar": ["dueno", "admin"],
  "pagos.verificar_manual": ["dueno", "admin"],
};

export function puede(
  rol: Rol | null | undefined,
  accion: keyof typeof ACCIONES | string,
): boolean {
  if (!rol) return false;
  return (ACCIONES[accion] ?? []).includes(rol);
}

export function puedeEscribir(
  rol: Rol | null | undefined,
  tabla: keyof typeof ESCRITURA | string,
): boolean {
  if (!rol) return false;
  return (ESCRITURA[tabla] ?? []).includes(rol);
}
