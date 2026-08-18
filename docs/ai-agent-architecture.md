# NOCTA Assistant — arquitectura y primer vertical slice

## Auditoría del repositorio

NOCTA usa Next.js 16.3 con App Router y React 19. El backend web está compuesto por Route Handlers en `app/api`; los servicios de datos usan Supabase SSR con la sesión del usuario y PostgreSQL/Supabase aplica RLS, funciones `security definer` y auditoría. No existe una integración previa con modelos de IA.

La identidad canónica se obtiene mediante `get_my_access_context()`. Esta contiene usuario, contexto principal activo, organización, rol y alcances por sede. Las capacidades se resuelven con `current_user_can()` y la autorización específica de sede con `can_manage_venue()`. El contexto de establecimiento distingue `owner`, `admin` y `establishment_admin`, incluido su `scope_venue_id`.

## Mapa funcional reutilizable

| Funcionalidad | Modelo | Servicio/regla existente | API/UI existente | Tool inicial |
| --- | --- | --- | --- | --- |
| Identidad activa | `profiles`, `user_active_contexts` | `get_my_access_context()` | `/api/auth/context` | `get_current_user` |
| Organización | `organizations`, membresías y roles | `current_user_can()` | `/api/organizations` | `get_current_organization` |
| Establecimientos | `venues` | `can_manage_venue()` | `/api/establishment` | `list_establishments` |
| Productos | `venue_menu_items` | RLS + pertenencia a sede | `/api/establishment`, `/api/menu` | `search_products` |
| Promociones | `promotions` | RLS y ventana válida | `/api/establishment` | `list_active_promotions` |
| Mecánica promocional | `promotion_rules`, `promotion_rule_items` | `configure_promotion_rule()`, motor de elegibilidad | `/api/promotion-admin` | `validate_promotion`, `create_promotion` |
| Auditoría | `audit_logs` | registros server-side | `/api/admin/integrity` | registro automático |
| Eventos | `events`, colaboraciones y tickets | `create_commercial_event()` | `/api/events`, `/api/promoter-events` | siguiente vertical slice |

También existen campañas/activaciones y catálogo de marca (`brand_campaigns`, `brand_activations`, `brand_products`), promotores y equipos, reservas, órdenes, fidelidad, analítica y colaboración. El primer slice no modifica estos módulos.

## Integración implementada

```text
NoctaAssistant (Client Component)
  → POST /api/ai/assistant (NDJSON)
    → contexto autenticado y alcance de sede
      → orchestrator (máximo 8 pasos)
        → intent router (Responses API / fallback limitado)
        → tool registry READ / DRAFT / WRITE
          → servicios de promociones
            → RLS + RPC transaccional
              → promotions + rules + items + audit_logs
```

El modelo recibe únicamente contexto verificable y produce una intención estructurada. Nunca recibe autorización ni acceso SQL. Los IDs usados por la propuesta proceden del catálogo consultado. Las herramientas WRITE no se exponen en modo producción hasta activar el segundo feature flag.

La confirmación es persistida, expira, pertenece al usuario/conversación/organización/sede y solo puede consumirse una vez. Al consumirla, el RPC vuelve a validar identidad, capacidad, sede, productos, ventana y mecánica dentro de la transacción.

## Archivos

Nuevos:

- `lib/ai/`: orquestador, contexto, flags, prompts, tipos, validación, permisos y tools.
- `app/api/ai/assistant/route.ts`: endpoint server-only con respuesta NDJSON.
- `components/nocta-assistant*.tsx`: shell conversacional, previews, resultados, sugerencias, errores y confirmación.
- `supabase/migrations/202608180059_agentic_ai_foundation.sql`: conversaciones, mensajes, runs, tool calls, confirmaciones y RPC atómico.
- Pruebas unitarias en `lib/ai/*.test.ts`.

Modificados:

- `app/admin/layout.tsx`: monta el asistente únicamente con el feature flag.
- `.env.example`: flags, clave privada y modelo.
- `package.json`: comando `test:ai`.

## Riesgos y límites

- La migración debe aplicarse antes de habilitar el asistente; de lo contrario el endpoint fallará de forma segura.
- La calidad de extracción con modelo debe evaluarse con frases reales de usuarios. Sin clave existe un fallback deliberadamente limitado, no un sustituto del modelo.
- El costo estimado no se muestra si no hay presupuesto o un servicio financiero canónico; no se inventan cálculos.
- La primera capacidad cubre creación y listado de promociones. Eventos e insights conservan puntos de extensión, pero no ejecutan escrituras todavía.
- La creación manual actual vive dentro de `/api/establishment`. Conviene migrarla posteriormente al mismo servicio/RPC para tener una única entrada transaccional sin reescribir la UI actual.

## Activación gradual

1. Aplicar la migración.
2. Configurar `OPENAI_API_KEY` y, opcionalmente, `OPENAI_AGENT_MODEL`.
3. Activar `AI_ASSISTANT_ENABLED=true` para READ + DRAFT.
4. Validar permisos, propuestas y auditoría en un entorno de prueba.
5. Activar `AI_AGENT_WRITE_ACTIONS_ENABLED=true` para permitir confirmaciones WRITE.
