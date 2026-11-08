import { describe, expect, it, vi } from "vitest";
import { interpretar } from "./ia";

describe("interpretar", () => {
  it("si las reglas entienden, no llama a la IA", async () => {
    const ia = vi.fn();
    expect(await interpretar("cuánto vendí hoy", ia)).toEqual({ tipo: "ventas", periodo: "hoy" });
    expect(ia).not.toHaveBeenCalled();
  });
  it("si las reglas no entienden, usa la IA", async () => {
    const ia = vi.fn(async () => ({ tipo: "ventas" as const, periodo: "semana" as const }));
    expect(await interpretar("cómo nos fue estos días", ia)).toEqual({ tipo: "ventas", periodo: "semana" });
    expect(ia).toHaveBeenCalledOnce();
  });
  it("si la IA falla o se cae, responde 'no entendido' sin romper", async () => {
    expect(await interpretar("algo raro", async () => { throw new Error("503"); })).toEqual({ tipo: "no_entendido" });
  });
  it("trunca el mensaje que se manda a la IA", async () => {
    const ia = vi.fn(async () => ({ tipo: "ayuda" as const }));
    await interpretar("x".repeat(2000), ia);
    expect((ia.mock.calls[0] as unknown as [string])[0]).toHaveLength(500);
  });
});
