# Surtix — Arquitectura

## Vista general

```
[Navegador / PWA]  ──►  [Next.js (Vercel)]  ──►  [Supabase: Postgres + Auth + Storage]
      │  IndexedDB (offline)        │                         │
      │                             ├──► API de Claude (IA)   │ trigger escribe en eventos_outbox
      │                             │                         ▼
[WhatsApp] ◄──► [n8n self-hosted] ◄─┴──── webhooks ◄──── [eventos_outbox]
```

- **Next.js** sirve la interfaz y la lógica de negocio (Server Actions + rutas `/api`).
- **Supabase** guarda todo. RLS aísla cada negocio (`organizacion_id`).
- **n8n** no toca la lógica de negocio: lee eventos y llama endpoints de Surtix con un token propio.
- **Claude API** se llama solo desde el servidor (`/api/ia/*`), nunca desde el navegador.

## Multi-tenant

- `organizaciones` = un negocio cliente. `miembros` une usuarios con organizaciones y define el rol.
- Toda tabla de negocio tiene `organizacion_id`.
- Política RLS estándar: `organizacion_id in (select mis_organizaciones())`.
- Escrituras sensibles (anular, ajustar, cerrar caja) además validan rol con `tiene_rol(org, roles[])`.

## Inventario por movimientos

- `movimientos_inventario` es la verdad. Tipos: `compra`, `venta`, `ajuste_entrada`, `ajuste_salida`,
  `traslado_entrada`, `traslado_salida`, `devolucion_cliente`, `devolucion_proveedor`, `anulacion`, `inicial`.
- `cantidad` siempre positiva; el signo lo da el tipo (`signo` = +1 / -1).
- Trigger `aplicar_movimiento` actualiza `existencias` (cantidad y costo promedio ponderado).
- Movimientos inmutables: sin UPDATE ni DELETE (bloqueado por trigger).
- Se permite stock negativo **solo si** la organización lo configura (algunos negocios venden antes de registrar la compra); siempre genera alerta.

## Costo promedio ponderado

Al entrar mercancía con costo `c` y cantidad `q`:

```
nuevo_costo = (stock_actual * costo_actual + q * c) / (stock_actual + q)
```

Las salidas usan el costo promedio vigente (queda guardado en el movimiento para calcular utilidad exacta).

## Documentos

Venta, compra, ajuste, traslado: cabecera + detalle + estado (`borrador`, `confirmado`, `anulado`).
Confirmar genera movimientos dentro de **una sola transacción** (función SQL `confirmar_venta`, etc.).
Anular genera movimientos contrarios y registro en `auditoria`.

## Offline (POS)

1. El POS descarga catálogo, precios y existencias a IndexedDB (Dexie).
2. Venta offline → se guarda local con `offline_id` (UUID) y estado `pendiente_sync`.
3. Al volver la conexión, la cola envía en orden. El servidor usa `offline_id` único para ignorar duplicados.
4. Conflictos de stock: la venta se acepta (ya se entregó la mercancía) y se genera alerta si queda negativo.

## Eventos y n8n (patrón outbox)

- Funciones/trigger insertan en `eventos_outbox` (`tipo`, `payload`, `procesado_en`).
- n8n consulta cada minuto `GET /api/webhooks/eventos?pendientes` (o Supabase Realtime / Database Webhook)
  y marca como procesado.
- Entradas desde n8n (mensaje de WhatsApp del dueño, pedido de cliente) llegan a `/api/webhooks/*`
  firmadas con HMAC (`N8N_WEBHOOK_SECRET`).

## IA

| Endpoint | Entrada | Salida |
|---|---|---|
| `POST /api/ia/factura` | foto/PDF | proveedor, ítems (descripción, cantidad, costo), totales + coincidencias con productos |
| `POST /api/ia/comprobante` | foto | banco/app, monto, fecha, referencia, nombre |
| `POST /api/ia/cuaderno` | fotos | productos y/o deudas detectadas |
| `POST /api/ia/importar-excel` | encabezados + muestra | mapeo de columnas |
| `POST /api/ia/consulta` | pregunta en texto | respuesta usando funciones de consulta seguras (nunca SQL libre) |

Reglas:
- Salida siempre en JSON validada con Zod. Si no valida, se reintenta una vez y si no, se marca para revisión manual.
- **La IA propone, el usuario confirma.** Nada de la IA se guarda como definitivo sin confirmación.
- Guardar en `documentos_ia` la imagen, el resultado y la confianza para auditoría y mejoras.
- Para el asistente de consultas usar *tool use*: funciones como `ventas_por_periodo`, `top_productos`,
  `existencia_producto`, ejecutadas con el usuario autenticado (respetan RLS).

## Verificación de comprobantes

- Se calcula hash perceptual de la imagen + se normaliza la referencia.
- Si coincide con un comprobante previo de la organización → alerta `comprobante_repetido`.
- Si el monto leído ≠ monto del pago → alerta `comprobante_monto_diferente`.
- Estado del pago: `sin_verificar`, `verificado_ia`, `verificado_manual`, `sospechoso`.

## Seguridad

- Auth de Supabase (correo/contraseña y enlace mágico; luego OTP por WhatsApp).
- RLS en todas las tablas. Tests de RLS: un usuario de la org A no puede leer nada de la org B.
- Rate limit en `/api/ia/*` y webhooks.
- `auditoria` registra: tabla, id, acción, antes/después, usuario, fecha, IP.
- Backups diarios (Supabase) + export semanal vía n8n.

## Despliegue

- Next.js en Vercel. Supabase cloud (plan gratis al inicio).
- n8n en un VPS barato (Docker) con dominio propio y HTTPS.
- Variables de entorno: ver `.env.example`.
