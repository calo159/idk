import {
  Boxes,
  ChartColumn,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export interface ItemMenu {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Prefijo de ruta que marca este ítem como activo (por defecto, su href). */
  activoEn?: string;
  /** Posición en la barra inferior del celular (1-4). Los demás van en "Más". */
  ordenMovil?: number;
  /** Botón central destacado (acción principal: vender). */
  destacado?: boolean;
}

/** Única fuente de verdad del menú: barra inferior (celular) y lateral (escritorio). */
export const ITEMS_MENU: ItemMenu[] = [
  { href: "/dashboard", etiqueta: "Inicio", icono: LayoutDashboard, ordenMovil: 1 },
  { href: "/inventario", etiqueta: "Inventario", icono: Boxes, ordenMovil: 2 },
  {
    href: "/ventas/pos",
    etiqueta: "Vender",
    icono: ShoppingCart,
    activoEn: "/ventas",
    ordenMovil: 3,
    destacado: true,
  },
  { href: "/caja", etiqueta: "Caja", icono: Wallet, ordenMovil: 4 },
  { href: "/productos", etiqueta: "Productos", icono: Package },
  { href: "/compras", etiqueta: "Compras", icono: Truck },
  { href: "/clientes", etiqueta: "Clientes", icono: Users },
  { href: "/proveedores", etiqueta: "Proveedores", icono: Store },
  { href: "/reportes", etiqueta: "Reportes", icono: ChartColumn },
  { href: "/configuracion", etiqueta: "Configuración", icono: Settings },
];

export const ITEMS_BARRA_MOVIL = ITEMS_MENU.filter((i) => i.ordenMovil).sort(
  (a, b) => (a.ordenMovil ?? 0) - (b.ordenMovil ?? 0),
);
export const ITEMS_MAS = ITEMS_MENU.filter((i) => !i.ordenMovil);

export function estaActivo(item: ItemMenu, ruta: string): boolean {
  const base = item.activoEn ?? item.href;
  return ruta === base || ruta.startsWith(`${base}/`);
}
