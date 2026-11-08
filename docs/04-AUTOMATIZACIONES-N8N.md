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

## Implementación (estado real)

### F1 — Alertas al dueño ✅ (sin probar contra un n8n real)
- Migración `0020`: cada alerta nueva emite `alerta.creada`; `reclamar_eventos` entrega eventos a un solo consumidor
  (arrendamiento de 2 min, 5 intentos), descarta `stock.bajo` repetidos del día y `comprobante.sospechoso` (ya cubierto por su alerta).
- `GET /api/webhooks/eventos` (Bearer `SURTIX_API_TOKEN`) devuelve el mensaje ya armado y el destino (`573…`).
- `POST /api/webhooks/eventos/{id}` confirma `{ok:true}` o `{ok:false,error}`. Exige Bearer **y** firma HMAC:
  `x-surtix-firma = HMAC_SHA256(secreto, "{x-surtix-fecha}.{cuerpo}")`, fecha en milisegundos, tolerancia ±5 min.
- Flujo exportado: `n8n/F1-alertas-al-dueno.json`. Variables de n8n: `SURTIX_URL`, `SURTIX_API_TOKEN`, `N8N_WEBHOOK_SECRET`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`.
- El dueño configura su WhatsApp en Configuración. Sin número, los eventos se confirman sin enviarse.
- Nota: los mensajes iniciados por el negocio fuera de la ventana de 24 h requieren plantilla aprobada por Meta (`n8n/plantillas.md`).

### F2 y F3 — Resumen diario y reporte semanal ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0021`: `resumen_periodo(org, desde, hasta)` (jsonb, neto de devoluciones) y `organizaciones_para_resumen()`, solo `service_role`.
- `GET /api/webhooks/resumen?tipo=dia|semana` devuelve por negocio `{destino, mensaje, archivo_pdf}`. La semana es la anterior completa (lun–dom).
- `GET /api/webhooks/resumen?tipo=semana&pdf=1&organizacion=…` devuelve el PDF de una página.
- Flujos: `n8n/F2-resumen-diario.json` (8:00 p. m.) y `n8n/F3-reporte-semanal-pdf.json` (lunes 7:00 a. m.).

### F4 — Cobranza ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0022`: deuda vencida por antigüedad (los abonos pagan lo más viejo primero), puntaje de pago 0–100 (bueno ≥ 70,
  regular 40–69, malo < 40) y recordatorios en 3 niveles (1, 7 y 15 días de mora; `organizaciones.dias_credito`, 30 por defecto).
- `GET /api/webhooks/cobranza` solo responde de lunes a sábado entre 8 a. m. y 7 p. m. (Bogotá) y respeta a quien no acepta mensajes.
  `POST` (token + firma HMAC) confirma el envío para no repetirlo. Flujo: `n8n/F4-cobranza.json` (10:00 a. m.).
- En la app: puntaje en la ficha del cliente, insignia "No fiar más" en la lista y, en el POS, fiar a un mal pagador exige autorización del dueño/admin.

### F5 — Bot del dueño por WhatsApp ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0023`: `bot_resolver` (solo dueño/admin por `miembros.telefono` o el WhatsApp de alertas), `bot_registrar_mensaje`
  (idempotencia por ID de mensaje), `bot_guardar_pendiente`/`bot_tomar_pendiente` (confirmaciones que vencen a los 10 min) y `registrar_gasto_bot`.
- `POST /api/webhooks/whatsapp-dueno` (token + firma HMAC): `{telefono, texto, mensaje_id}` → `{respuesta, destino}`.
  Un número no autorizado recibe `respuesta: null` (el bot no revela que existe).
- Interpretación: reglas primero (ventas, stock, deudas, gastos con "45 mil", "1,5 millones"…) y la IA (Claude, tool use) solo si las reglas no entienden.
  La IA no puede confirmar ni cancelar: eso solo lo hacen las palabras exactas del dueño. **Todo gasto pide SÍ/NO antes de guardarse.**
- Pendiente: el nodo de transcripción de audio (elegir proveedor) y la verificación GET del webhook de Meta.

### F6 — Pedidos de clientes por WhatsApp ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0024`: `pedidos_whatsapp` (pendiente → confirmado / rechazado). El negocio se identifica por `organizaciones.whatsapp_phone_number_id`
  (Configuración). Un pedido **no es una venta**: no toca inventario, caja ni cartera hasta que una persona lo vende desde el POS.
- `POST /api/webhooks/pedido` (token + firma HMAC): extrae renglones con reglas («2 cemento, 10 metros de cable»; la IA solo si las reglas no sacan nada),
  los empareja con el catálogo (ambiguos y desconocidos quedan "por confirmar" con candidatos) y responde al cliente sin prometer precios.
- Panel: Ventas → Pedidos WhatsApp → «Preparar venta» abre el POS con el carrito lleno (precios actuales y lista del cliente). Al cobrar, el pedido
  pasa a confirmado y el cliente recibe el total (`pedido.confirmado` por F1). «Rechazar» avisa con el motivo.
- Flujo: `n8n/F6-pedidos-clientes.json`. Pendiente: verificación GET del webhook de Meta.

### F7 — Reposición sugerida ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0025`: ritmo de venta = 60 % últimos 14 días + 40 % últimos 60; días restantes = stock / ritmo; compra sugerida para cubrir
  `cobertura + entrega` días y siempre hasta el stock mínimo. Proveedor sugerido = el del último precio más barato. Crítico = se acaba antes de que llegue el pedido.
- App: Compras → Sugerencias (elige productos/proveedor/cantidad y crea **una orden de compra en borrador por proveedor**; no mueve inventario).
- `GET /api/webhooks/reposicion` + `n8n/F7-reposicion-sugerida.json` (lunes 7:00 a. m.) avisan al dueño.
- **Diferencia con el diseño original:** el pedido al proveedor por WhatsApp y el «responde SÍ para crear la orden» no están: la orden se crea en la app.

### F8 — Fidelización ✅ (sin probar contra n8n/WhatsApp reales)
- Migración `0029`: puntos por celular (libro de movimientos: 1 punto por cada `pesos_por_punto`, hacia abajo; se revierten al anular la venta),
  canje (`valor_punto` pesos por punto) y listas de cumpleaños de hoy y clientes inactivos (2+ compras y 30 a 365 días sin comprar). Apagada por defecto.
- El saludo de cumpleaños regala puntos de bono (queda en el libro), no un descuento que alguien deba recordar. Cada contacto se registra para no repetirlo
  (cumpleaños: una vez al año; inactivos: cada 60 días).
- POS: al elegir un cliente con puntos aparece «Canjear»; el valor entra en el descuento de la venta y el canje se registra al confirmarla.
  Si dos ventas sin internet gastan los mismos puntos, la segunda no se bloquea: el dueño recibe la alerta `canje_sin_saldo`.
- App: Clientes → Fidelización (configurar, lista del día con enlace de WhatsApp y «Ya escribí»).
- `GET/POST /api/webhooks/fidelizacion` + `n8n/F8-fidelizacion.json` (lunes a sábado 9 a. m., mismo horario respetuoso que la cobranza).
