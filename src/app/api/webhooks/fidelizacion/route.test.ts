import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmar } from "@/lib/firma";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc }) }));
let enHorario = true;
vi.mock("@/lib/cobranza", () => ({ dentroDeHorarioDeCobro: () => enHorario }));

const TOKEN = "token-de-n8n-largo-1234567890";
const SECRETO = "secreto-hmac-de-32-caracteres-ok!!";
beforeEach(() => {
  rpc.mockReset();
  enHorario = true;
  process.env.SURTIX_API_TOKEN = TOKEN;
  process.env.N8N_WEBHOOK_SECRET = SECRETO;
});
const { GET, POST } = await import("./route");
const obtener = (token: string | null = TOKEN) => GET(new Request("http://x/api/webhooks/fidelizacion", { headers: token ? { authorization: `Bearer ${token}` } : {} }));
const enviar = (cuerpo: unknown, firmado = true) => {
  const t = JSON.stringify(cuerpo);
  const f = firmar(t, SECRETO);
  return POST(new Request("http://x/api/webhooks/fidelizacion", { method: "POST", body: t, headers: { authorization: `Bearer ${TOKEN}`, ...(firmado ? { "x-surtix-firma": f.firma, "x-surtix-fecha": f.fecha } : {}) } }));
};
const fila = (o: object) => ({ organizacion_id: "o1", organizacion: "Ferretería El Puerto", cliente_id: "c1", cliente: "Yaneth Ipuana", telefono: "3112223344", tipo: "cumpleanos", dato: 0, puntos: 0, puntos_bono: 50, valor_punto: 10, ...o });

describe("GET /api/webhooks/fidelizacion", () => {
  it("sin token: 401", async () => {
    expect((await obtener(null)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("arma el mensaje de cumpleaños y el de inactivo con el destino de WhatsApp", async () => {
    rpc.mockResolvedValueOnce({ data: [fila({}), fila({ cliente_id: "c2", tipo: "inactivo", dato: 45, puntos: 120 })], error: null });
    const r = await (await obtener()).json();
    expect(r.contactos).toHaveLength(2);
    expect(r.contactos[0].destino).toBe("573112223344");
    expect(r.contactos[0].mensaje).toContain("Feliz cumpleaños, Yaneth");
    expect(r.contactos[1].mensaje).toContain("Hace 45 días");
  });
  it("ignora teléfonos inválidos", async () => {
    rpc.mockResolvedValueOnce({ data: [fila({ telefono: "123" })], error: null });
    expect((await (await obtener()).json()).contactos).toEqual([]);
  });
  it("fuera de horario no devuelve nada ni consulta", async () => {
    enHorario = false;
    expect(await (await obtener()).json()).toMatchObject({ contactos: [], motivo: "fuera de horario" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/fidelizacion", () => {
  it("sin firma: 401", async () => {
    expect((await enviar({ cliente_id: crypto.randomUUID(), tipo: "inactivo" }, false)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("tipo inválido: 400", async () => {
    expect((await enviar({ cliente_id: crypto.randomUUID(), tipo: "spam" })).status).toBe(400);
  });
  it("registra el contacto", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    const id = crypto.randomUUID();
    expect(await (await enviar({ cliente_id: id, tipo: "cumpleanos" })).json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("registrar_contacto_fidelizacion", { p_cliente: id, p_tipo: "cumpleanos" });
  });
});
