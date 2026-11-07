import type { ReactNode } from "react";

/**
 * Encabezado superior. En celular muestra la marca; en escritorio la barra lateral ya la tiene.
 * `acciones` queda libre para el indicador de conexión (1.13) y el menú de usuario (1.1).
 */
export function Encabezado({
  negocio = "Mi negocio",
  acciones,
}: {
  negocio?: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground md:hidden">
          S
        </span>
        <p className="truncate text-base font-semibold" data-testid="nombre-negocio">
          {negocio}
        </p>
      </div>
      <div className="flex items-center gap-2">{acciones}</div>
    </header>
  );
}
