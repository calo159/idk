# Surtix

SaaS de **inventario, compras y ventas** para negocios pequeños y medianos de Colombia (empezando por Riohacha, La Guajira).
No es "otro inventario": se diferencia por **WhatsApp**, **IA que ahorra digitación**, **control de pérdidas**, **verificación de pagos
Nequi/Daviplata** y **funcionamiento sin internet**.

> "Surtix" es un nombre provisional.

## Estado

Las 4 fases del [roadmap](docs/03-ROADMAP.md) están construidas (54 de 54 tareas). Se desarrolló sin Docker ni credenciales reales, así que
**todo está probado con tests, pero falta probarlo contra servicios reales** (Supabase, Wompi, WhatsApp/n8n, API de Claude, un teléfono).
Cada tarea del roadmap indica qué quedó sin verificar. Antes de producción, lee `docs/06-DECISIONES.md`.

## Qué hace

- **Inventario y compras:** stock solo por movimientos (kardex, costo promedio ponderado), lotes con vencimiento, seriales, traslados, conteos,
  órdenes de compra, cuentas por pagar, comparador de proveedores, compra sugerida con temporadas.
- **Ventas:** POS móvil con lector de código por cámara, pagos mixtos, fiado con cupo, cotizaciones, separados, devoluciones, **modo sin internet**.
- **Control de pérdidas:** auditoría de todo, alertas antirrobo, cierre de caja con diferencia, verificación de comprobantes (repetidos o con monto distinto).
- **IA:** factura de proveedor por foto, cuaderno de fiados por foto, lectura de comprobantes, asistente en lenguaje natural. La IA propone, la persona confirma.
- **WhatsApp (vía n8n):** alertas al dueño, resumen diario y reporte semanal en PDF, cobranza, bot del dueño, pedidos de clientes.
- **Crecimiento:** precios automáticos por margen, promociones de plata dormida, fidelización por celular, catálogo web público, venta en ruta,
  puntaje de salud del negocio.
- **Negocio:** planes y cobro con Wompi, panel de super-admin, facturación electrónica (marco con proveedor simulado), referidos,
  benchmark anónimo por nicho, compras en grupo y portal del distribuidor.

## Stack

Next.js 16 (App Router) · TypeScript estricto · Tailwind 4 + shadcn/ui · Supabase (PostgreSQL + RLS + Auth + Storage) · Zod · TanStack Query ·
Dexie (offline) · n8n · API de Claude · Vitest + PGlite · Playwright.

## Reglas que nunca se rompen

1. El stock nunca se edita: todo cambio es un movimiento en `movimientos_inventario`.
2. Multi-tenant siempre: `organizacion_id` + RLS en toda tabla de negocio.
3. Dinero en `numeric(14,2)` (COP) y cantidades en `numeric(14,3)`; nada de sumas sueltas con `number`.
4. Los documentos se anulan, no se borran.
5. Lo creado sin internet lleva `offline_id` para no duplicarse al sincronizar.
6. Secretos solo en variables de entorno.

Detalle completo en [`CLAUDE.md`](CLAUDE.md).

## Documentación

| Archivo | Contenido |
|---|---|
| [`docs/01-PRODUCTO.md`](docs/01-PRODUCTO.md) | Funciones y por qué |
| [`docs/02-ARQUITECTURA.md`](docs/02-ARQUITECTURA.md) | Cómo está construido (reglas obligatorias) |
| [`docs/03-ROADMAP.md`](docs/03-ROADMAP.md) | Tareas por fase y qué falta verificar |
| [`docs/04-AUTOMATIZACIONES-N8N.md`](docs/04-AUTOMATIZACIONES-N8N.md) | Flujos n8n (F1 a F9) y WhatsApp |
| [`docs/05-VENTA-Y-NEGOCIO.md`](docs/05-VENTA-Y-NEGOCIO.md) | Cómo validarlo y venderlo |
| [`docs/06-DECISIONES.md`](docs/06-DECISIONES.md) | Decisiones técnicas y de privacidad (D-001 a D-012) |
| [`supabase/migrations/`](supabase/migrations) | Esquema de base de datos (fuente de verdad) |
| [`n8n/`](n8n) | Flujos exportados en JSON |

## Desarrollo

```bash
cp .env.example .env.local      # completa las llaves (Supabase local: `npm run db:start` las imprime)
npm install
npm run dev                     # http://localhost:3000

npm run lint && npm run typecheck
npm test                        # unitarios + base de datos (PGlite, sin Docker)
npm run db:test                 # solo base de datos: RLS, inventario, costos, ventas, caja, planes, etc.
npm run test:e2e                # Playwright (usa Edge del sistema; en CI: npx playwright install chromium)

npm run db:start                # Supabase local (requiere Docker Desktop)
npm run db:reset                # aplica migraciones + seed
npm run db:tipos                # regenera src/lib/supabase/tipos.ts (sin Docker, desde las migraciones)
```

Los tests de base de datos ejecutan las migraciones reales sobre Postgres en WASM (PGlite) con un esquema `auth` simulado.

### Variables de entorno

Ver [`.env.example`](.env.example). Las que activan integraciones: `ANTHROPIC_API_KEY` (IA), `WHATSAPP_*` y `SURTIX_API_TOKEN` /
`N8N_WEBHOOK_SECRET` (n8n y WhatsApp), `WOMPI_*` (cobro de suscripciones).

### Primer super-admin

Se da de alta solo por SQL (ver D-009):

```sql
insert into super_admins (usuario_id) values ('<uuid de auth.users>');
```

## Datos de demo (ferretería de Riohacha, 60 días)

```bash
npm run demo:sql        # genera supabase/seed-demo.sql (≈2 MB, no se sube al repositorio)
```

Cárgalo en un Supabase **vacío**. Crea 78 productos, 6 proveedores, 25 clientes, ~1.360 ventas, 40 compras, abonos, cierres de caja con
faltantes plantados, una venta anulada y comprobantes sospechosos, todo con las funciones reales del sistema.
Usuarios: `demo@surtix.co` (dueño) · `maria@surtix.co` y `luis@surtix.co` (vendedores) · contraseña `Demo-Surtix-2026`.
