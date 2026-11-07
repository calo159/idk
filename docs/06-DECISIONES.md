# Surtix — Decisiones técnicas

Registro corto de decisiones que no están en `02-ARQUITECTURA.md`. Una entrada por decisión.

## D-001 · Next.js 16 sin `cacheComponents`
- **Contexto:** `create-next-app` activa `cacheComponents` y `partialPrefetching` por defecto.
- **Decisión:** se desactivan. Todo el área `(app)` depende de la sesión del usuario y de RLS; no hay contenido
  cacheable entre usuarios. Con `cacheComponents` cada lectura de `cookies()` exige un `<Suspense>` y no aporta valor.
- **Cuándo revisar:** catálogo público (3.11), donde sí conviene caché.
- **Nota:** `middleware.ts` ahora se llama `proxy.ts` en Next 16.

## D-002 · Tests de base de datos con PGlite (sin Docker)
- **Contexto:** `supabase start` requiere Docker; no siempre está disponible (ej. el equipo de desarrollo inicial).
- **Decisión:** `src/test/db/` levanta Postgres real en WASM (PGlite), simula `auth.users`/`auth.uid()` como lo hace
  Supabase (`request.jwt.claim.sub`) y crea los roles `anon`/`authenticated`/`service_role`. Aplica las migraciones
  reales de `supabase/migrations/` en orden. Así los tests de RLS, kardex y funciones SQL corren en cualquier máquina y en CI.
- **Límite:** no cubre GoTrue ni Storage. Esos se prueban con Supabase local (`npm run db:start`) y Playwright.

## D-003 · Dinero con `decimal.js`
- PostgREST entrega `numeric` como número JSON (los tipos generados dicen `number`). Es seguro para numeric(14,2) (≤ 15 dígitos
  significativos), pero NUNCA se opera con ese `number`: `src/lib/dinero.ts` lo convierte a `Decimal` (redondeo igual al
  de Postgres) y hacia la BD se envía `paraBd()` (string). Prohibido sumar/multiplicar dinero con `+` o `*` sueltos.

## D-004 · Cambios de BD solo con migraciones nuevas
- `0001_esquema_inicial.sql` está probada y congelada. Correcciones y ampliaciones van en `0002_…`, `0003_…`.
