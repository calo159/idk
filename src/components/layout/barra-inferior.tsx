"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ITEMS_BARRA_MOVIL, ITEMS_MAS, estaActivo } from "./menu";

/** Menú inferior del celular: 4 accesos + "Más". Oculto desde `md` hacia arriba. */
export function BarraInferior() {
  const ruta = usePathname();
  const [masAbierto, setMasAbierto] = useState(false);
  const masActivo = ITEMS_MAS.some((i) => estaActivo(i, ruta));

  return (
    <>
      <nav
        aria-label="Menú principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {ITEMS_BARRA_MOVIL.map((item) => {
            const activo = estaActivo(item, ruta);
            const Icono = item.icono;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground",
                    activo && "text-primary",
                  )}
                >
                  {item.destacado ? (
                    <span
                      className={cn(
                        "-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-[var(--background)]",
                        activo && "ring-primary/20",
                      )}
                    >
                      <Icono className="size-6" aria-hidden />
                    </span>
                  ) : (
                    <Icono className="size-5" aria-hidden />
                  )}
                  <span>{item.etiqueta}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMasAbierto(true)}
              aria-haspopup="dialog"
              aria-expanded={masAbierto}
              className={cn(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground",
                masActivo && "text-primary",
              )}
            >
              <Ellipsis className="size-5" aria-hidden />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>Más opciones</SheetTitle>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2 px-4 pb-4">
            {ITEMS_MAS.map((item) => {
              const Icono = item.icono;
              const activo = estaActivo(item, ruta);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMasAbierto(false)}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-medium hover:bg-muted",
                      activo && "border-primary bg-primary/5 text-primary",
                    )}
                  >
                    <Icono className="size-6" aria-hidden />
                    {item.etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
