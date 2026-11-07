# CLAUDE.md — Surtix

> "Surtix" es un nombre provisional. Se puede cambiar en todo el proyecto cuando el dueño lo decida.

## Qué es este proyecto

Surtix es un SaaS de **gestión de inventario, compras y ventas** para negocios pequeños y medianos de Colombia
(empezando por Riohacha, La Guajira). No es "otro inventario": se diferencia por WhatsApp, IA que ahorra digitación,
control de pérdidas/robo, verificación de pagos Nequi/Daviplata y funcionamiento sin internet.

Antes de programar cualquier cosa, lee en este orden:

1. `docs/01-PRODUCTO.md` — qué hace el sistema y por qué.
2. `docs/02-ARQUITECTURA.md` — cómo está construido. **Reglas obligatorias.**
3. `docs/03-ROADMAP.md` — en qué fase vamos y qué tarea sigue.
4. `docs/04-AUTOMATIZACIONES-N8N.md` — flujos de n8n.
5. `supabase/migrations/` — el esquema de base de datos es la fuente de verdad.

## Stack

- **Frontend/Backend:** Next.js (App Router, última versión estable) + TypeScript estricto.
- **UI:** Tailwind CSS + shadcn/ui. Diseño mobile-first (el dueño usa el celular).
- **Base de datos/Auth/Storage:** Supabase (PostgreSQL + Row Level Security).
- **Validación:** Zod en todas las entradas (formularios, server actions, rutas API, webhooks).
- **Estado del servidor:** TanStack Query en cliente; Server Actions para mutaciones.
- **Offline (POS):** PWA + IndexedDB (Dexie) con cola de sincronización.
- **Automatizaciones:** n8n (self-hosted), consumiendo la tabla `eventos_outbox` y webhooks.
- **WhatsApp:** WhatsApp Business Cloud API (Meta), siempre a través de n8n.
- **IA:** API de Claude (visión para facturas, comprobantes, cuadernos; texto para consultas).
- **Tests:** Vitest (unidad), Playwright (e2e de flujos críticos: venta, compra, cierre de caja).

## Reglas que NUNCA se rompen

1. **El stock nunca se edita directamente.** Todo cambio de inventario es un INSERT en `movimientos_inventario`.
   La tabla `existencias` la mantiene un trigger. Los movimientos son inmutables: para corregir, se crea
   un movimiento contrario.
2. **Multi-tenant siempre.** Toda tabla de negocio tiene `organizacion_id` y RLS activado.
   Nunca uses la service role key en código que corre en el navegador.
3. **Dinero:** `numeric(14,2)` en BD, pesos colombianos (COP). En TypeScript usa una utilidad de dinero
   (centavos enteros o decimal.js), nunca sumas sueltas con `number` en cálculos de totales.
4. **Cantidades:** `numeric(14,3)` (se vende por metro, kilo, unidad, caja).
5. **Todo documento (venta, compra, ajuste) se anula, no se borra.** Anular genera movimientos contrarios
   y un registro en `auditoria`.
6. **Idempotencia offline:** cada venta/movimiento creado offline lleva `offline_id` (UUID generado en el
   cliente) para no duplicarse al sincronizar.
7. **Secretos** solo en variables de entorno. Nunca en el repositorio.
8. **Toda la interfaz en español de Colombia.** Fechas en zona `America/Bogota`. Formato de moneda `$ 12.500`.

## Estructura de carpetas

```
src/
  app/
    (auth)/            login, registro, recuperar
    (app)/             rutas protegidas
      dashboard/
      productos/
      inventario/      existencias, kardex, ajustes, traslados, conteos
      compras/
      ventas/          pos/, historial/, cotizaciones/, separados/
      caja/
      clientes/
      proveedores/
      reportes/
      configuracion/
    api/
      webhooks/        entrada desde n8n / WhatsApp
      ia/              lectura de facturas, comprobantes, cuadernos
  components/          ui/ (shadcn) + componentes de dominio
  lib/
    supabase/          clientes server / browser
    dinero.ts
    offline/           Dexie + cola de sincronización
    validaciones/      esquemas Zod por módulo
  server/              lógica de negocio (servicios) usada por server actions
supabase/
  migrations/
  seed.sql
n8n/                   flujos exportados en JSON
docs/
```

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run lint
npm run test           # vitest
npm run test:e2e       # playwright
npx supabase start     # supabase local (requiere Docker)
npx supabase db reset  # aplica migraciones + seed
npx supabase gen types typescript --local > src/lib/supabase/tipos.ts
```

## Cómo trabajar

- Trabaja **por fases y tareas** del `docs/03-ROADMAP.md`. Al terminar una tarea, márcala `[x]`.
- Antes de una tarea grande, propón un plan corto y espera aprobación.
- Cambios de BD siempre como **nueva migración** en `supabase/migrations/`, nunca editando una ya aplicada.
- Después de cada migración, regenera los tipos de TypeScript.
- Escribe tests para la lógica de inventario, costos y caja: ahí un error cuesta plata real al cliente.
- Si algo del roadmap no está claro, pregunta antes de inventar.
- Commits pequeños en español: `feat(ventas): POS con lector de código por cámara`.
