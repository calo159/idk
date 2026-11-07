import { formatoCOPCorto } from "@/lib/dinero";

export interface PuntoBarra {
  etiqueta: string;
  valor: number;
  /** Texto accesible/tooltip, ej. "mar 4 nov: $ 120.000". */
  descripcion: string;
  destacado?: boolean;
}

/** Barras simples en CSS, accesibles (tabla oculta para lectores de pantalla) y sin dependencias. */
export function GraficoBarras({ puntos, titulo }: { puntos: PuntoBarra[]; titulo: string }) {
  const max = Math.max(...puntos.map((p) => p.valor), 1);
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{titulo}</figcaption>
      <div className="flex h-36 items-end gap-2" role="img" aria-label={titulo}>
        {puntos.map((p) => (
          <div key={p.etiqueta} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {p.valor > 0 ? formatoCOPCorto(p.valor) : ""}
            </span>
            <div
              title={p.descripcion}
              className={`w-full rounded-t ${p.destacado ? "bg-primary" : "bg-primary/40"}`}
              style={{ height: `${Math.max((p.valor / max) * 100, p.valor > 0 ? 4 : 1)}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{p.etiqueta}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{titulo}</caption>
        <tbody>
          {puntos.map((p) => (
            <tr key={p.etiqueta}>
              <th scope="row">{p.etiqueta}</th>
              <td>{p.descripcion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
