import { describe, expect, it } from "vitest";
import { TOLERANCIA_MS, firmar, igualesSeguro, tokenValido, verificarFirma } from "./firma";

const SECRETO = "secreto-de-prueba-de-32-caracteres!";
const cuerpo = JSON.stringify({ id: 7, ok: true });

describe("firma HMAC", () => {
  it("una firma recién hecha es válida", () => {
    const { firma, fecha } = firmar(cuerpo, SECRETO);
    expect(verificarFirma(cuerpo, firma, fecha, SECRETO)).toEqual({ valida: true });
  });
  it("cambiar un solo byte del cuerpo invalida la firma", () => {
    const { firma, fecha } = firmar(cuerpo, SECRETO);
    expect(verificarFirma(cuerpo.replace("7", "8"), firma, fecha, SECRETO)).toEqual({ valida: false, motivo: "firma_incorrecta" });
  });
  it("otro secreto no valida; mayúsculas en el hex sí se aceptan", () => {
    const { firma, fecha } = firmar(cuerpo, SECRETO);
    expect(verificarFirma(cuerpo, firma, fecha, "otro-secreto-distinto-de-32-chars!!").valida).toBe(false);
    expect(verificarFirma(cuerpo, firma.toUpperCase(), fecha, SECRETO).valida).toBe(true);
  });
  it("rechaza mensajes viejos o del futuro (anti-repetición)", () => {
    const ahora = 1_800_000_000_000;
    const viejo = firmar(cuerpo, SECRETO, ahora - TOLERANCIA_MS - 1);
    expect(verificarFirma(cuerpo, viejo.firma, viejo.fecha, SECRETO, ahora)).toEqual({ valida: false, motivo: "expirada" });
    const futuro = firmar(cuerpo, SECRETO, ahora + TOLERANCIA_MS + 1);
    expect(verificarFirma(cuerpo, futuro.firma, futuro.fecha, SECRETO, ahora).valida).toBe(false);
    const limite = firmar(cuerpo, SECRETO, ahora - TOLERANCIA_MS);
    expect(verificarFirma(cuerpo, limite.firma, limite.fecha, SECRETO, ahora).valida).toBe(true);
  });
  it("no se puede reutilizar la firma con otra fecha", () => {
    const { firma } = firmar(cuerpo, SECRETO, Date.now() - 1000);
    expect(verificarFirma(cuerpo, firma, String(Date.now()), SECRETO).valida).toBe(false);
  });
  it("encabezados ausentes o con formato raro", () => {
    expect(verificarFirma(cuerpo, null, "123", SECRETO)).toEqual({ valida: false, motivo: "faltan_encabezados" });
    expect(verificarFirma(cuerpo, "abc", undefined, SECRETO)).toEqual({ valida: false, motivo: "faltan_encabezados" });
    expect(verificarFirma(cuerpo, "abc", "ayer", SECRETO)).toEqual({ valida: false, motivo: "fecha_invalida" });
  });
});

describe("comparación y token", () => {
  it("igualesSeguro", () => {
    expect(igualesSeguro("abc", "abc")).toBe(true);
    expect(igualesSeguro("abc", "abd")).toBe(false);
    expect(igualesSeguro("abc", "abcd")).toBe(false);
  });
  it("Bearer correcto, incorrecto, sin esquema y sin token configurado", () => {
    expect(tokenValido("Bearer token-largo-123456", "token-largo-123456")).toBe(true);
    expect(tokenValido("bearer token-largo-123456", "token-largo-123456")).toBe(true);
    expect(tokenValido("Bearer otro", "token-largo-123456")).toBe(false);
    expect(tokenValido("token-largo-123456", "token-largo-123456")).toBe(false);
    expect(tokenValido("Bearer algo", undefined)).toBe(false);
    expect(tokenValido(null, "x")).toBe(false);
  });
});
