import { beforeEach, describe, expect, it, vi } from "vitest";

let sesion: unknown;
vi.mock("@/lib/auth/contexto", () => ({ obtenerSesion: async () => sesion }));
vi.mock("@/lib/supabase/servidor", () => ({ crearClienteServidor: async () => ({}) }));
const repoFalso = { deudas: vi.fn(async () => [{ nombre: "José", saldo: 5000, vencido: 0, dias_mora: 0 }]) };
vi.mock("@/server/asistente/repo", () => ({ crearRepoAsistente: () => repoFalso }));

const listo = (rol: string, usuarioId = "u1") => ({ estado: "listo", contexto: { rol, usuarioId, organizacionId: "o1", negocio: "Ferretería" } });
const { POST } = await import("./route");
const enviar = (cuerpo: unknown) => POST(new Request("http://x/api/ia/consulta", { method: "POST", body: JSON.stringify(cuerpo) }));

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  sesion = listo("dueno");
});

describe("POST /api/ia/consulta", () => {
  it("sin sesión: 401", async () => {
    sesion = { estado: "sin_sesion" };
    expect((await enviar({ pregunta: "hola" })).status).toBe(401);
  });
  it("un vendedor no entra a los reportes del negocio: 403", async () => {
    sesion = listo("vendedor");
    expect((await enviar({ pregunta: "¿cuánto vendí hoy?" })).status).toBe(403);
  });
  it("pregunta vacía o demasiado larga: 400", async () => {
    expect((await enviar({ pregunta: " " })).status).toBe(400);
    expect((await enviar({ pregunta: "a".repeat(501) })).status).toBe(400);
    expect((await enviar({})).status).toBe(400);
  });
  it("sin clave de IA responde con las reglas (origen: reglas)", async () => {
    const r = await (await enviar({ pregunta: "quién me debe" })).json();
    expect(r.origen).toBe("reglas");
    expect(r.respuesta).toContain("José");
  });
  it("después de 20 preguntas en 10 minutos frena con 429", async () => {
    sesion = listo("admin", "usuario-spam");
    for (let i = 0; i < 20; i++) expect((await enviar({ pregunta: "quién me debe" })).status).toBe(200);
    expect((await enviar({ pregunta: "quién me debe" })).status).toBe(429);
    sesion = listo("admin", "otro-usuario");
    expect((await enviar({ pregunta: "quién me debe" })).status).toBe(200);
  });
});
