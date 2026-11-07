import Anthropic from "@anthropic-ai/sdk";
import { entornoServidor, requerirServidor } from "@/lib/env";
import { type FacturaIA, HERRAMIENTA_FACTURA, esquemaFacturaIA } from "@/lib/validaciones/ia";

export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

const INSTRUCCIONES = `Eres un asistente de digitación para negocios de Colombia.
Lees UNA foto de una factura de compra de un proveedor y llamas a la herramienta registrar_factura.
Reglas:
- Los valores están en pesos colombianos (COP). El punto es separador de miles: "12.500" es 12500.
- costo_unitario es el precio por unidad ANTES de IVA si la factura lo separa; si no, el que aparezca.
- No inventes datos. Si algo no se ve o no estás seguro, usa null y agrega una advertencia.
- Una línea por producto, con su cantidad. No incluyas subtotales, IVA, fletes ni descuentos como productos.
- confianza: 1 = foto nítida y completa; baja el valor si hay texto borroso, cortado o dudoso.`;

/** Función que llama al modelo; se inyecta en pruebas para no gastar la API. */
export type LlamarModelo = (imagen: { base64: string; tipo: TipoImagen }) => Promise<unknown>;

export class ErrorIA extends Error {
  constructor(
    mensaje: string,
    readonly codigo: "sin_configurar" | "modelo" | "respuesta_invalida",
  ) {
    super(mensaje);
  }
}

export const llamarClaudeFactura: LlamarModelo = async ({ base64, tipo }) => {
  const apiKey = entornoServidor().ANTHROPIC_API_KEY;
  if (!apiKey) throw new ErrorIA("La lectura con IA no está configurada (falta ANTHROPIC_API_KEY).", "sin_configurar");
  const cliente = new Anthropic({ apiKey });
  const respuesta = await cliente.messages.create({
    model: requerirServidor("ANTHROPIC_MODEL"),
    max_tokens: 4096,
    system: INSTRUCCIONES,
    tools: [HERRAMIENTA_FACTURA],
    tool_choice: { type: "tool", name: HERRAMIENTA_FACTURA.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: base64 } },
          { type: "text", text: "Lee esta factura." },
        ],
      },
    ],
  });
  const uso = respuesta.content.find((b) => b.type === "tool_use");
  if (!uso || uso.type !== "tool_use")
    throw new ErrorIA("El modelo no devolvió datos de la factura.", "respuesta_invalida");
  return uso.input;
};

/** Lee una factura: llama al modelo y valida SIEMPRE la salida con Zod. */
export async function leerFactura(
  imagen: { base64: string; tipo: TipoImagen },
  llamar: LlamarModelo = llamarClaudeFactura,
): Promise<FacturaIA> {
  let crudo: unknown;
  try {
    crudo = await llamar(imagen);
  } catch (e) {
    if (e instanceof ErrorIA) throw e;
    throw new ErrorIA("No pudimos contactar a la IA. Intenta de nuevo.", "modelo");
  }
  const r = esquemaFacturaIA.safeParse(crudo);
  if (!r.success) throw new ErrorIA("La IA devolvió datos que no pudimos entender.", "respuesta_invalida");
  return r.data;
}
