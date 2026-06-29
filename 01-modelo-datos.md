# Modelo de datos multi-tenant — Kronorix Padel Suite

## Concepto clave: tenant = profesor

Cada profesor (ej. Pablo Miki) es un **tenant**. Todo lo que pertenece a su negocio
(alumnos, clases, pagos, bonos, notificaciones) vive bajo su propio espacio aislado.
Esto es lo que permite añadir profesores nuevos sin tocar código ni mezclar datos.

```
/tenants/{tenantId}
/tenants/{tenantId}/alumnos/{alumnoId}
/tenants/{tenantId}/clases/{claseId}
/tenants/{tenantId}/pagos/{pagoId}
/tenants/{tenantId}/bonos/{bonoId}
/tenants/{tenantId}/notificaciones/{uid}/items/{notifId}
/tenants/{tenantId}/wallets/{alumnoId}/movimientos/{movId}

/users/{uid}                      ← un documento por persona (global, sin tenant)
/platformAdmins/{uid}             ← marca quién es super admin (Kronorix)
```

### ¿Por qué `/tenants/{tenantId}/...` y no todo en la raíz?

Porque las reglas de seguridad de Firestore pueden apoyarse en la ruta. Con esta
estructura, "solo puedes leer/escribir si tu tenantId coincide con el de la ruta"
es una sola condición, válida para todas las subcolecciones. Si todo estuviera en
la raíz (como ahora con `bookings`, `users`...) habría que filtrar por campo
`tenantId` en cada query y además confiar en que el cliente nunca pida sin filtro
— mucho más fácil de hacer mal o de explotar.

---

## `/users/{uid}` — Identidad y rol (colección global, sin tenant)

Cada persona que entra en el sistema (super admin, profesor, alumno) tiene **un único**
documento aquí. Es el primer sitio que la app consulta al iniciar sesión, para saber
quién es y a qué tenant pertenece.

```ts
type UserDoc = {
  uid: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'alumno';

  // Solo relevante si role = 'admin' o 'alumno'.
  // Un admin SOLO gestiona su propio tenant. Un alumno SOLO pertenece a uno.
  tenantId: string | null;

  // Solo si role = 'alumno': referencia rápida a su doc de alumno dentro del tenant,
  // para no tener que buscarlo por uid cada vez.
  alumnoId: string | null;

  active: boolean;          // permite desactivar sin borrar (bajas, impago de licencia, etc.)
  createdAt: Timestamp;
  createdBy: string;        // uid de quien lo creó (super admin o el propio admin)
};
```

**Por qué un solo doc global y no `admins/{uid}` + `profiles/{uid}` como ahora:**
hoy la app hace 2-3 lecturas (`admins`, `profile`, `profiles`, `users`) para saber
quién es alguien. Con un único doc por persona con `role` y `tenantId`, es una sola
lectura al login y ya sabemos: quién es, qué puede hacer, y de qué tenant es.

---

## `/platformAdmins/{uid}` — Lista de super admins

Documento vacío o `{ since: Timestamp }`. Existe únicamente para que las **reglas de
seguridad** puedan comprobar `exists(/platformAdmins/$(request.auth.uid))` sin tener
que leer ni confiar en el campo `role` del propio usuario (que en teoría alguien
podría intentar manipular si las reglas tuvieran un fallo). Es una capa de seguridad
redundante a propósito — separar "quién dice ser super admin" de "quién la
plataforma reconoce como super admin".

---

## `/tenants/{tenantId}` — Datos del profesor/negocio

```ts
type TenantDoc = {
  tenantId: string;            // mismo valor que el id del doc
  slug: string;                // "pablomiki" -> usado en la URL /pablomiki/...
  nombreProfesor: string;
  nombreNegocio: string;       // ej. "Pablo Miki Padel"
  email: string;
  telefono?: string;

  // Branding (lo que cambiaremos del look Kronorix al del profesor)
  branding: {
    logoUrl?: string;
    colorPrimario: string;     // hex
    colorSecundario: string;
  };

  // Configuración de negocio
  config: {
    duracionClaseMinutos: number;     // default 60
    avisoCancelacionHoras: number;    // ej. 24
    monedaSimbolo: string;            // "€"
  };

  plan: 'trial' | 'activo' | 'suspendido';
  active: boolean;             // el super admin puede desactivar el tenant entero
  createdAt: Timestamp;
  createdBy: string;           // uid del super admin que lo creó
};
```

`slug` es único en toda la plataforma (se valida al crear el tenant) y es lo que
forma la URL: `kronorixpadel.com/pablomiki`.

---

## `/tenants/{tenantId}/alumnos/{alumnoId}`

```ts
type AlumnoDoc = {
  alumnoId: string;
  uid: string | null;          // null hasta que el alumno activa su login
  nombre: string;
  email?: string;
  telefono?: string;
  nivel?: string;               // "iniciacion" | "intermedio" | "avanzado" (libre)
  fechaAlta: Timestamp;
  fechaBaja: Timestamp | null;  // null = alumno activo
  estado: 'activo' | 'baja';

  modalidad: 'bono' | 'suelta'; // cómo paga este alumno por defecto
  bonoActualId: string | null;  // referencia al bono en curso, si modalidad = 'bono'

  notas?: string;                // notas privadas del profesor
  createdAt: Timestamp;
  createdBy: string;             // uid del admin que lo creó
};
```

---

## `/tenants/{tenantId}/bonos/{bonoId}`

Un bono es un periodo (normalmente mensual) con un nº de clases contratadas.

```ts
type BonoDoc = {
  bonoId: string;
  alumnoId: string;
  clasesContratadas: number;
  clasesConsumidas: number;      // se incrementa al confirmar asistencia a una clase
  precio: number;
  fechaInicio: Timestamp;
  fechaFin: Timestamp;
  estado: 'activo' | 'agotado' | 'caducado';
  createdAt: Timestamp;
};
```

`clasesConsumidas` se actualiza mediante transacción cuando se marca asistencia,
igual que `attendeeUids` se gestiona hoy con `runTransaction` en bookings.

---

## `/tenants/{tenantId}/clases/{claseId}`

Equivalente directo a `Booking` en el código actual, pero pensado para alumnos en
vez de jugadoras de equipo.

```ts
type ClaseDoc = {
  claseId: string;
  fecha: string;            // YYYY-MM-DD (igual que ahora con normalizeYMD)
  hora: string;              // "18:00"
  duracionMinutos: number;
  pista?: string;

  tipo: 'individual' | 'dos' | 'grupo';
  capacidad: number;         // 1, 2, o el tamaño del grupo

  alumnosIds: string[];      // quién está confirmado
  alumnosAsistieron: string[]; // tras dar la clase, quién vino realmente (para stats)
  listaEsperaIds: string[];

  estado: 'programada' | 'completada' | 'cancelada_profesor' | 'cancelada_alumno';
  recurrenciaId?: string;    // si viene de una regla recurrente, referencia a ella

  notas?: string;
  createdAt: Timestamp;
  createdBy: string;
};
```

## `/tenants/{tenantId}/clasesRecurrentes/{reglaId}`

```ts
type ClaseRecurrenteDoc = {
  reglaId: string;
  diaSemana: number;        // 0-6
  hora: string;
  duracionMinutos: number;
  alumnosIds: string[];
  activa: boolean;
  fechaInicio: string;       // YYYY-MM-DD
  fechaFin?: string;         // si tiene fin, o indefinida
};
```

Un Cloud Function (o un job manual al entrar al calendario) genera los documentos
`clases` reales de las próximas N semanas a partir de estas reglas — igual que ya
planeábamos para "todos los martes a las 18:00".

---

## `/tenants/{tenantId}/pagos/{pagoId}`

```ts
type PagoDoc = {
  pagoId: string;
  alumnoId: string;
  tipo: 'bono' | 'suelta';
  bonoId?: string;            // si tipo = 'bono'
  claseId?: string;           // si tipo = 'suelta', a qué clase corresponde
  importe: number;
  metodo: 'efectivo' | 'transferencia' | 'bizum' | 'otro';
  fecha: Timestamp;
  registradoPor: string;       // uid del admin
};
```

---

## `/tenants/{tenantId}/wallets/{alumnoId}` + `/movimientos/{movId}`

Igual patrón que el wallet actual (`wallets/{uid}/movimientos`), pero indexado por
`alumnoId` en vez de `uid`, y anidado bajo el tenant.

---

## `/tenants/{tenantId}/notificaciones/{uid}/items/{notifId}`

Mismo patrón que `notifications/{uid}/items` actual, anidado bajo el tenant.

---

## Resumen de por qué este modelo escala

1. **Aislamiento real**: cada profesor nuevo es solo un nuevo documento en
   `/tenants` + sus subcolecciones vacías. No hay migración ni cambio de esquema.
2. **Reglas de seguridad simples y auditable**: una sola regla "tu tenantId debe
   coincidir" cubre todas las subcolecciones de golpe.
3. **Coste de lecturas controlado**: las queries de un admin siempre están acotadas
   a su propio tenant (nunca leen de más), así que el coste de Firestore crece de
   forma lineal con el número de profesores, no exponencial.
4. **Reutilización directa de lógica de Padel Planner**: transacciones de cupo,
   lista de espera, wallet y notificaciones se trasladan casi 1:1, solo cambia el
   path (se le añade el prefijo `/tenants/{tenantId}/`).
