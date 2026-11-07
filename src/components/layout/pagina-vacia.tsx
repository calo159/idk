import type { LucideIcon } from "lucide-react";

/** Marcador de posición para pantallas que se construyen en tareas posteriores del roadmap. */
export function PaginaVacia({
  titulo,
  descripcion,
  icono: Icono,
  tarea,
}: {
  titulo: string;
  descripcion: string;
  icono: LucideIcon;
  /** Tarea del roadmap que la construye, ej. "1.3". */
  tarea?: string;
}) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icono className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-sm text-balance text-muted-foreground">{descripcion}</p>
      {tarea ? (
        <p className="text-xs text-muted-foreground">
          Se construye en la tarea {tarea} del roadmap.
        </p>
      ) : null}
    </section>
  );
}
