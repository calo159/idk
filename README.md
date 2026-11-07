# Surtix

Sistema de inventario, compras y ventas para negocios de Colombia, con WhatsApp, IA, control de pérdidas y modo sin internet.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Instrucciones que Claude Code lee solo al abrir el proyecto |
| `docs/01-PRODUCTO.md` | Todas las funciones, por fases |
| `docs/02-ARQUITECTURA.md` | Cómo está construido |
| `docs/03-ROADMAP.md` | Lista de tareas en orden |
| `docs/04-AUTOMATIZACIONES-N8N.md` | Flujos de n8n y WhatsApp |
| `docs/05-VENTA-Y-NEGOCIO.md` | Cómo validarlo y venderlo |
| `supabase/migrations/0001_esquema_inicial.sql` | Base de datos (probada) |
| `PROMPTS-CLAUDE-CODE.md` | Qué pegarle a Claude Code, en orden |

## Cómo empezar

1. Instala Node.js (LTS), Git, Docker Desktop y Claude Code.
2. Descomprime esta carpeta y entra a ella en la terminal.
3. `git init && git add . && git commit -m "docs: plan inicial de Surtix"`
4. Ejecuta `claude` y pega el prompt 1 de `PROMPTS-CLAUDE-CODE.md`.

## Lo que ya hace la base de datos

- Stock calculado por movimientos, con kardex y costo promedio ponderado.
- Compras, ventas con pagos mixtos y crédito, anulaciones con auditoría.
- Caja con cierre y diferencia.
- Verificación de comprobantes repetidos o con monto diferente.
- Alertas (stock bajo, ventas anuladas, ajustes grandes, caja) listas para n8n.
- Aislamiento entre negocios (RLS) y bloqueos para que nadie edite stock, saldos o ventas confirmadas a mano.
