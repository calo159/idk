import { describe, expect, it } from "vitest";
import { ESCRITURA, puede, puedeEscribir } from "../permisos";
import { esquemaInvitacion, esquemaLogin, esquemaRegistro, mensajeAuth, rutaSegura } from "./auth";

describe("registro", () => {
  const base = {
    nombre: "María Pérez",
    correo: " Maria@Ferreteria.co ",
    contrasena: "clave1234",
    negocio: "Ferretería El Puerto",
    nicho: "ferreteria",
  };
  it("normaliza el correo y acepta datos válidos", () => {
    const r = esquemaRegistro.parse(base);
    expect(r.correo).toBe("maria@ferreteria.co");
  });
  it("rechaza contraseña corta, nicho inventado y negocio vacío", () => {
    const r = esquemaRegistro.safeParse({
      ...base,
      contrasena: "123",
      nicho: "naves",
      negocio: " ",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0]);
      expect(campos).toEqual(expect.arrayContaining(["contrasena", "nicho", "negocio"]));
    }
  });
  it("login pide ambos campos", () => {
    expect(esquemaLogin.safeParse({ correo: "a@b.co", contrasena: "" }).success).toBe(false);
  });
});

describe("invitación", () => {
  it("no se puede invitar como dueño", () => {
    expect(esquemaInvitacion.safeParse({ correo: "a@b.co", rol: "dueno" }).success).toBe(false);
    expect(esquemaInvitacion.safeParse({ correo: "a@b.co", rol: "vendedor" }).success).toBe(true);
  });
});

describe("rutaSegura (evita redirecciones abiertas)", () => {
  it.each([
    ["/productos", "/productos"],
    ["/ventas/pos?x=1", "/ventas/pos?x=1"],
    ["//evil.com", "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["/javascript:alert(1)", "/dashboard"],
    ["", "/dashboard"],
    [null, "/dashboard"],
    ["productos", "/dashboard"],
  ])("%j → %j", (entrada, esperado) => {
    expect(rutaSegura(entrada as string | null)).toBe(esperado);
  });
});

describe("mensajes de Auth", () => {
  it("traduce los más comunes", () => {
    expect(mensajeAuth("Invalid login credentials")).toBe("Correo o contraseña incorrectos");
    expect(mensajeAuth("User already registered")).toMatch(/ya está registrado/);
    expect(mensajeAuth("algo raro")).toMatch(/Intenta de nuevo/);
  });
});

describe("permisos de interfaz", () => {
  it("el contador no escribe en ninguna tabla ni ejecuta acciones", () => {
    for (const t of Object.keys(ESCRITURA)) expect(puedeEscribir("contador", t)).toBe(false);
    expect(puede("contador", "ventas.confirmar")).toBe(false);
    expect(puede("contador", "ventas.anular")).toBe(false);
  });
  it("solo dueño y admin anulan", () => {
    expect(puede("vendedor", "ventas.anular")).toBe(false);
    expect(puede("admin", "ventas.anular")).toBe(true);
    expect(puede("dueno", "compras.anular")).toBe(true);
  });
  it("sin rol no hay permisos", () => {
    expect(puede(null, "ventas.confirmar")).toBe(false);
  });
});

describe("zCodigoReferido y el registro", () => {
  const base = { nombre: "Ana", correo: "ana@x.co", contrasena: "12345678", negocio: "Tienda", nicho: "general" };
  it("acepta el código en minúsculas y con espacios, y lo normaliza", async () => {
    const { esquemaRegistro } = await import("./auth");
    expect(esquemaRegistro.parse({ ...base, referido: "  surt-ab3k9z " }).referido).toBe("SURT-AB3K9Z");
  });
  it("es opcional: vacío o ausente no estorba", async () => {
    const { esquemaRegistro } = await import("./auth");
    expect(esquemaRegistro.parse({ ...base, referido: "" }).referido).toBeUndefined();
    expect(esquemaRegistro.parse(base).referido).toBeUndefined();
  });
  it("si lo escriben mal, avisa el formato (no lo ignora en silencio)", async () => {
    const { esquemaRegistro } = await import("./auth");
    for (const malo of ["SURT-123", "ABC", "SURT-AB3K9O", "SURT-AB3K9ZZ"]) {
      const r = esquemaRegistro.safeParse({ ...base, referido: malo });
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.message).toBe("El código tiene el formato SURT-XXXXXX");
    }
  });
});
