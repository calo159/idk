"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ITEMS_MENU, estaActivo } from "./menu";

/** Menú lateral de escritorio. Oculto en celular (ahí va la barra inferior). */
export function BarraLateral() {
  const ruta = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          S
        </span>
        <span className="text-lg font-semibold tracking-tight">Surtix</span>
      </div>
      <nav aria-label="Menú principal" className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {ITEMS_MENU.map((item) => {
            const activo = estaActivo(item, ruta);
            const Icono = item.icono;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent",
                    activo && "bg-sidebar-accent text-sidebar-accent-foreground",
                    item.destacado && !activo && "text-primary",
                  )}
                >
                  <Icono className="size-5" aria-hidden />
                  {item.etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
