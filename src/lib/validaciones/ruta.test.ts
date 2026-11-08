import { describe, expect, it } from "vitest";
import { esquemaVisita } from "./ruta";

const base = { offline_id: crypto.randomUUID(), cliente_id: crypto.randomUUID(), resultado: "pedido" as const };

describe("esquemaVisita", () => {
  it("acepta una visita mínima y con ubicación", () => {
    expect(esquemaVisita.safeParse(base).success).toBe(true);
    expect(esquemaVisita.safeParse({ ...base, lat: 11.5444, lng: -72.9072, precision_m: 15, nota: "  Pidió 10  " })).toMatchObject({ success: true, data: { nota: "Pidió 10" } });
  });
  it("rechaza resultados inventados, ubicación a medias o fuera de rango y notas largas", () => {
    expect(esquemaVisita.safeParse({ ...base, resultado: "x" }).success).toBe(false);
    expect(esquemaVisita.safeParse({ ...base, lat: 11.5 }).success).toBe(false);
    expect(esquemaVisita.safeParse({ ...base, lat: 91, lng: 0 }).success).toBe(false);
    expect(esquemaVisita.safeParse({ ...base, nota: "x".repeat(301) }).success).toBe(false);
  });
  it("la fecha debe ser de los últimos 7 días y no del futuro", () => {
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    expect(esquemaVisita.safeParse({ ...base, visitado_en: iso(-3_600_000) }).success).toBe(true);
    expect(esquemaVisita.safeParse({ ...base, visitado_en: iso(3_600_000) }).success).toBe(false);
    expect(esquemaVisita.safeParse({ ...base, visitado_en: iso(-8 * 86_400_000) }).success).toBe(false);
  });
});
