import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aCentavos, firmaIntegridad, leerTransaccion, urlCheckout, verificarEvento } from "./wompi";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const SECRETO = "prod_events_secreto_de_prueba";

const evento = (o: { status?: string; monto?: number; ref?: string; secreto?: string; ts?: number } = {}) => {
  const data = { transaction: { id: "1234-1610641025-49201", status: o.status ?? "APPROVED", amount_in_cents: o.monto ?? 7_990_000, reference: o.ref ?? "SUR-ABC123", currency: "COP" } };
  const ts = o.ts ?? 1_610_641_026;
  const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const checksum = sha(`${data.transaction.id}${data.transaction.status}${data.transaction.amount_in_cents}${ts}${o.secreto ?? SECRETO}`);
  return { event: "transaction.updated", data, timestamp: ts, sent_at: "2026-11-07T00:00:00Z", environment: "test", signature: { properties: props, checksum } };
};

describe("aCentavos", () => {
  it("convierte pesos a centavos exactos (sin errores de coma flotante)", () => {
    expect(aCentavos(79900)).toBe(7_990_000);
    expect(aCentavos("79900.00")).toBe(7_990_000);
    expect(aCentavos(0.1 + 0.2)).toBe(30);
    expect(aCentavos(239700)).toBe(23_970_000);
  });
});

describe("firmaIntegridad y checkout", () => {
  it("es el SHA-256 de referencia + centavos + moneda + secreto", () => {
    expect(firmaIntegridad("SUR-ABC123", 7_990_000, "secreto")).toBe(sha("SUR-ABC1237990000COPsecreto"));
  });
  it("la URL del checkout lleva llave pública, monto, referencia, firma y retorno", () => {
    const u = new URL(urlCheckout({ llavePublica: "pub_test_x", referencia: "SUR-ABC123", centavos: 7_990_000, secretoIntegridad: "secreto", urlRetorno: "https://app.surtix.co/suscripcion" }));
    expect(u.origin + u.pathname).toBe("https://checkout.wompi.co/p/");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      "public-key": "pub_test_x", currency: "COP", "amount-in-cents": "7990000", reference: "SUR-ABC123",
      "signature:integrity": sha("SUR-ABC1237990000COPsecreto"), "redirect-url": "https://app.surtix.co/suscripcion",
    });
  });
});

describe("verificarEvento", () => {
  it("acepta un evento firmado con el secreto correcto", () => {
    expect(verificarEvento(evento(), SECRETO)).toMatchObject({ valido: true });
  });
  it("rechaza un secreto distinto, un monto alterado y un timestamp alterado", () => {
    expect(verificarEvento(evento({ secreto: "otro" }), SECRETO)).toEqual({ valido: false, motivo: "checksum" });
    const alterado = evento();
    alterado.data.transaction.amount_in_cents = 100;
    expect(verificarEvento(alterado, SECRETO)).toEqual({ valido: false, motivo: "checksum" });
    const viejo = evento();
    viejo.timestamp += 1;
    expect(verificarEvento(viejo, SECRETO)).toEqual({ valido: false, motivo: "checksum" });
  });
  it("rechaza cuerpos que no tienen el formato de Wompi", () => {
    expect(verificarEvento({ hola: 1 }, SECRETO)).toEqual({ valido: false, motivo: "formato" });
    expect(verificarEvento(null, SECRETO)).toEqual({ valido: false, motivo: "formato" });
  });
  it("el checksum se compara sin importar mayúsculas", () => {
    const e = evento();
    e.signature.checksum = e.signature.checksum.toUpperCase();
    expect(verificarEvento(e, SECRETO)).toMatchObject({ valido: true });
  });
});

describe("leerTransaccion", () => {
  const ver = (o?: Parameters<typeof evento>[0]) => {
    const r = verificarEvento(evento(o), SECRETO);
    if (!r.valido) throw new Error("no valida");
    return leerTransaccion(r.evento);
  };
  it("APPROVED es la única que cuenta como pagada", () => {
    expect(ver()).toEqual({ id: "1234-1610641025-49201", referencia: "SUR-ABC123", centavos: 7_990_000, estado: "aprobado" });
    expect(ver({ status: "DECLINED" })?.estado).toBe("rechazado");
    expect(ver({ status: "ERROR" })?.estado).toBe("rechazado");
    expect(ver({ status: "VOIDED" })?.estado).toBe("rechazado");
    expect(ver({ status: "PENDING" })?.estado).toBe("pendiente");
  });
  it("ignora eventos que no son de transacciones", () => {
    const r = verificarEvento({ ...evento(), event: "nequi_token.updated" }, SECRETO);
    if (!r.valido) throw new Error("no valida");
    expect(leerTransaccion(r.evento)).toBeNull();
  });
});
