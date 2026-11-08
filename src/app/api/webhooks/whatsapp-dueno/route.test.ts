import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmar } from "@/lib/firma";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ crearClienteAdmin: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ ilike: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) }) }) }) }));
vi.mock("server-only", () => ({}));

const TOKEN = "token-de-n8n-largo-1234567890";
const SECRETO = "secreto-hmac-de-32-caracteres-ok!!";
const dueno = { organizacion_id: "o1", organizacion: "Ferretería El Puerto", usuario_id: "u1", nombre: "Carlos Pérez", rol: "dueno" };

beforeEach(() => {
  rpc.mockReset();
  process.env.SURTIX_API_TOKEN = TOKEN;
  process.env.N8N_WEBHOOK_SECRET = SECRETO;
  delete process.env.ANTHROPIC_API_KEY;
});

const { POST } = await import("./route");
const enviar = (cuerpo: unknown, o: { firmar?: boolean; token?: string } = {}) => {
  const t = JSON.stringify(cuerpo);
  const f = firmar(t, SECRETO);
  return POST(new Request("http://x/api/webhooks/whatsapp-dueno", { method: "POST", body: t, headers: { authorization: `Bearer ${o.token ?? TOKEN}`, ...(o.firmar === false ? {} : { "x-surtix-firma": f.firma, "x-surtix-fecha": f.fecha }) } }));
};
const msg = (texto: string, id = "wamid.1") => ({ telefono: "573001112233", texto, mensaje_id: id });

describe("POST /api/webhooks/whatsapp-dueno", () => {
  it("sin token o sin firma: 401 y no toca la base de datos", async () => {
    expect((await enviar(msg("hola"), { token: "malo" })).status).toBe(401);
    expect((await enviar(msg("hola"), { firmar: false })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("un número no autorizado no recibe respuesta (no se revela el bot)", async () => {
    rpc.mockResolvedValueOnce({ data: [] });
    const r = await (await enviar(msg("hola"))).json();
    expect(r).toEqual({ respuesta: null, motivo: "numero_no_autorizado" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("un mensaje repetido de WhatsApp no se procesa otra vez", async () => {
    rpc.mockResolvedValueOnce({ data: [dueno] }).mockResolvedValueOnce({ data: false });
    expect(await (await enviar(msg("hola"))).json()).toEqual({ respuesta: null, motivo: "mensaje_repetido" });
  });
  it("un saludo del dueño recibe la ayuda y el destino normalizado", async () => {
    rpc.mockResolvedValueOnce({ data: [dueno] }).mockResolvedValueOnce({ data: true });
    const r = await (await enviar(msg("Hola"))).json();
    expect(r.respuesta).toContain("Hola Carlos");
    expect(r.destino).toBe("573001112233");
  });
  it("un gasto pide confirmación y guarda la acción pendiente (no el gasto)", async () => {
    rpc.mockResolvedValueOnce({ data: [dueno] }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ error: null });
    const r = await (await enviar(msg("gasté 45 mil en flete", "wamid.2"))).json();
    expect(r.respuesta).toContain("¿Lo confirmo?");
    const nombres = rpc.mock.calls.map((c) => c[0]);
    expect(nombres).toEqual(["bot_resolver", "bot_registrar_mensaje", "bot_guardar_pendiente"]);
    expect(nombres).not.toContain("registrar_gasto_bot");
  });
  it("cuerpo inválido: 400", async () => {
    expect((await enviar({ telefono: "1" })).status).toBe(400);
  });
});
