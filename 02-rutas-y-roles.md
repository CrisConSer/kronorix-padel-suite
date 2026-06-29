# Rutas y roles — Kronorix Padel Suite

## Estructura de rutas (Next.js App Router)

Usamos **ruta por profesor** (`/[tenantSlug]/...`), no subdominio. Es más simple
de desplegar (un solo dominio, sin configurar DNS wildcard ni certificados por
subdominio) y Next.js lo resuelve de forma nativa con rutas dinámicas.

```
/                              → landing pública de Kronorix (o redirect a /login)
/login                         → login genérico (detecta el rol tras autenticar)

/superadmin                    → panel del super admin (Kronorix)
/superadmin/profesores         → listado y alta de profesores (tenants)
/superadmin/profesores/[id]    → detalle/edición de un tenant (sin ver alumnos)

/[tenantSlug]                  → home del profesor o del alumno, según rol
/[tenantSlug]/calendario       → calendario de clases (admin: gestiona, alumno: ve/confirma)
/[tenantSlug]/alumnos          → listado y alta de alumnos (solo admin)
/[tenantSlug]/alumnos/[id]     → ficha de alumno: historial, bono, pagos (solo admin)
/[tenantSlug]/pagos            → registro de pagos (solo admin)
/[tenantSlug]/dashboard        → cuadro de mando (solo admin)
/[tenantSlug]/mi-cuenta        → bono, pagos y clases del propio alumno (solo alumno)
```

`tenantSlug` viene de `tenants/{tenantId}.slug` (ej. `pablomiki`). La URL final
es del tipo `kronorixpadel.com/pablomiki/calendario`.

### Por qué ruta y no subdominio

- Un solo certificado SSL, un solo dominio que configurar.
- Despliegue único en Firebase Hosting / Vercel, sin reglas de wildcard DNS.
- Cuando migréis al dominio propio del profesor (`pablomiki-padel.com`), basta un
  *redirect* a `kronorixpadel.com/pablomiki` o, más adelante, un rewrite —
  no afecta a la arquitectura de datos ni a las reglas de seguridad.

---

## Resolución de rol al iniciar sesión

```
1. Usuario hace login (email/password) en /login
2. Leer /users/{uid} → obtener { role, tenantId, alumnoId, active }
3. Si !active → mostrar "cuenta desactivada, contacta con tu profesor/Kronorix"
4. Redirigir según role:
   - super_admin → /superadmin
   - admin       → /{tenantSlug}        (slug resuelto desde tenants/{tenantId})
   - alumno      → /{tenantSlug}/mi-cuenta
```

Este flujo es deliberadamente igual al patrón actual de Padel Planner
(`onAuthStateChanged` + lectura de doc de perfil), solo que ahora ese doc trae
también `tenantId`, que es lo que activa todo el filtrado multi-tenant.

---

## Guard de rutas (middleware conceptual)

Cada página bajo `/[tenantSlug]/...` debe comprobar, en el cliente (y reforzado
por las reglas de Firestore en el servidor lógico):

```ts
// Pseudocódigo del guard que envuelve cada página de tenant
function useTenantGuard(tenantSlugFromUrl: string) {
  const { role, tenantId, mySlug } = useSessionUser();

  if (role === 'super_admin') return { allowed: true, mode: 'readonly-support' };
  if (role === 'admin' && mySlug === tenantSlugFromUrl) return { allowed: true, mode: 'admin' };
  if (role === 'alumno' && mySlug === tenantSlugFromUrl) return { allowed: true, mode: 'alumno' };

  return { allowed: false }; // → redirect a /login o pantalla "sin acceso"
}
```

La clave: **el slug de la URL nunca decide qué tenantId se consulta**. Lo que
decide es el `tenantId` del propio usuario autenticado. La URL es solo
cosmética/de navegación; si alguien edita la URL a mano para intentar entrar en
`/otroprofesor/alumnos`, el guard lo bloquea porque su `tenantId` no coincide —
y aunque el guard de cliente fallara, las reglas de Firestore lo bloquean igual.

---

## Resumen de permisos por rol

| Acción | super_admin | admin (profesor) | alumno |
|---|---|---|---|
| Crear/editar/desactivar tenants (profesores) | ✅ | ❌ | ❌ |
| Ver métricas agregadas de todos los tenants | ✅ | ❌ (solo las suyas) | ❌ |
| Ver alumnos, pagos, notas de un tenant ajeno | ❌ | ❌ | ❌ |
| Alta/baja de alumnos de su propio tenant | ❌ | ✅ | ❌ |
| Crear/editar clases de su propio tenant | ❌ | ✅ | ❌ |
| Apuntarse/desapuntarse a una clase | ❌ | ✅ (por un alumno) | ✅ (solo él mismo) |
| Registrar pagos | ❌ | ✅ | ❌ |
| Ver su propio historial de clases y pagos | ❌ | — | ✅ |
| Ver cuadro de mando de su negocio | ❌ | ✅ | ❌ |

El super admin no tiene "❌ rotundo" en todo por capricho: es la decisión que
tomamos para que los profesores confíen en la privacidad de sus datos de negocio,
y para reducir la responsabilidad legal de Kronorix sobre datos de alumnos que no
le pertenecen.
