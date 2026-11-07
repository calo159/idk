# Surtix — Automatizaciones con n8n

Todos los flujos se exportan en JSON a `n8n/` con el nombre del flujo.
n8n se autentica contra Surtix con `SURTIX_API_TOKEN` y firma lo que envía con `N8N_WEBHOOK_SECRET` (HMAC SHA-256 en el header `x-surtix-firma`).

## Eventos que emite Surtix (`eventos_outbox.tipo`)

| Evento | Cuándo |
|---|---|
| `stock.bajo` | Existencia ≤ stock mínimo |
| `stock.negativo` | Existencia < 0 |
| `venta.anulada` | Se anula una venta |
| `caja.cerrada` | Cierre de turno (incluye diferencia) |
| `comprobante.sospechoso` | Repetido o monto diferente |
| `ajuste.grande` | Ajuste negativo por encima del umbral configurado |
| `cliente.deuda_vencida` | Saldo con más de N días |
| `producto.vence_pronto` | Lote con vencimiento en ≤ 30 días |
| `compra.alza_precio` | Proveedor subió costo más de X% |

## Flujos

### F1 — Alertas al dueño
Disparo: cada minuto, lee eventos pendientes.
Pasos: agrupar por organización → plantilla de mensaje por tipo → enviar WhatsApp al dueño → marcar procesado.
Evitar spam: máximo 1 mensaje de `stock.bajo` por producto por día.

### F2 — Resumen diario (8:00 p. m.)
Llama `GET /api/reportes/resumen-dia` por organización activa y envía:
ventas, utilidad, métodos de pago, comprobantes sin verificar, diferencia de caja, top 3 productos, alertas.

### F3 — Reporte semanal en PDF (lunes 7:00 a. m.)
Genera PDF (`/api/reportes/semanal.pdf`) y lo envía por WhatsApp con un texto corto:
"Esta semana ganaste X, tu mejor producto fue Y, ojo con Z".

### F4 — Cobranza
Diario 10:00 a. m. Clientes con deuda vencida → mensaje amable con saldo. Escalamiento: día 1, 7, 15.
Respeta horario (8 a. m.–7 p. m.) y la opción del cliente de no recibir mensajes.

### F5 — Bot del dueño por WhatsApp
Webhook de Meta → n8n → si es audio, transcribir → `POST /api/webhooks/whatsapp-dueno` →
Surtix interpreta con IA (consultas o registro de gasto) → responde.
Solo números registrados como dueño/admin de la organización.

### F6 — Pedidos de clientes por WhatsApp
Mensaje del cliente → IA extrae productos y cantidades → `POST /api/webhooks/pedido` crea venta en borrador →
el negocio confirma en el panel → n8n envía confirmación y total al cliente.

### F7 — Reposición sugerida
Semanal. `GET /api/compras/sugerencia` → mensaje al dueño con la lista → si responde "sí", se crea orden de compra y se envía al proveedor.

### F8 — Fidelización
Diario: cumpleaños del día y clientes inactivos 30 días → mensaje con cupón.

### F9 — Backup
Semanal: export de datos por organización a almacenamiento externo.

## Plantillas de WhatsApp

Los mensajes iniciados por el negocio requieren plantillas aprobadas por Meta. Mantener la lista en `n8n/plantillas.md`.
