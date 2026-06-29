import type { Timestamp } from 'firebase/firestore';

/* ======================= Roles ======================= */
export type Role = 'super_admin' | 'admin' | 'alumno';

/* ======================= /users/{uid} ======================= */
export type UserDoc = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  tenantId: string | null;
  alumnoId: string | null;
  active: boolean;
  // Token de Firebase Cloud Messaging para notificaciones push. Se
  // guarda al dar permiso de notificaciones en el navegador/PWA (ver
  // src/pushClient.ts). null hasta que el usuario lo acepta, o si lo
  // revoca/expira. Mismo patrón que ya usa Padel Planner.
  fcmToken: string | null;
  fcmTokenUpdatedAt: Timestamp | null;
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId} ======================= */
export type TenantPlan = 'trial' | 'activo' | 'suspendido';

export type TenantBranding = {
  logoUrl?: string;
  colorPrimario: string;
  colorSecundario: string;
};

export type TenantConfig = {
  duracionClaseMinutos: number;
  avisoCancelacionHoras: number;
  monedaSimbolo: string;
};

export type TenantDoc = {
  tenantId: string;
  slug: string;
  nombreProfesor: string;
  nombreNegocio: string;
  email: string;
  telefono?: string;
  branding: TenantBranding;
  config: TenantConfig;
  plan: TenantPlan;
  active: boolean;
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/alumnos/{alumnoId} ======================= */
export type ModalidadAlumno = 'bono' | 'suelta';
export type EstadoAlumno = 'activo' | 'baja';

export type AlumnoDoc = {
  alumnoId: string;
  uid: string | null;
  nombre: string;
  email?: string;
  telefono?: string;
  nivel?: string;
  fechaAlta: Timestamp;
  fechaBaja: Timestamp | null;
  estado: EstadoAlumno;
  modalidad: ModalidadAlumno;
  bonoActualId: string | null;
  notas?: string;
  // IDs de /tenants/{tenantId}/tags — un alumno puede tener varios.
  tagsIds: string[];
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/tags/{tagId} ======================= */
export type TagDoc = {
  tagId: string;
  nombre: string;
  color: string; // hex, para el chip visual
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/bonos/{bonoId} ======================= */
export type EstadoBono = 'activo' | 'agotado' | 'caducado';

export type BonoDoc = {
  bonoId: string;
  alumnoId: string;
  clasesContratadas: number;
  clasesConsumidas: number;
  precio: number;
  fechaInicio: Timestamp;
  fechaFin: Timestamp;
  estado: EstadoBono;
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/clases/{claseId} ======================= */
export type TipoClase = 'individual' | 'dos' | 'grupo';
export type EstadoClase = 'programada' | 'completada' | 'cancelada_profesor' | 'cancelada_alumno';

/**
 * ClaseDoc
 * -----------------------------------------------------------------------
 * Modelo de negocio acordado:
 * - La clase nace con alumnos YA asignados por el profesor (alumnosIds),
 *   no como hueco vacío al que cualquiera se apunta libremente.
 * - Si capacidad > alumnosIds.length, hay un "hueco libre". Ese hueco se
 *   ofrece SOLO a alumnos que comparten al menos 1 tag con los alumnos
 *   ya asignados a la clase (mismo nivel/categoría). Esto NO se guarda
 *   como un campo aparte: se calcula en el cliente comparando los
 *   tagsIds de alumnosIds contra los tagsIds de cada alumno candidato
 *   (ver src/calendarioClient.ts -> alumnosCompatiblesConHueco()).
 * - listaEsperaIds es para el caso "cupo ya cubierto pero quiero un
 *   suplente por si alguien cancela" — si un alumno de alumnosIds se da
 *   de baja de la clase, el primero de listaEsperaIds se promociona
 *   automáticamente a alumnosIds (igual que ya pasa en Padel Planner).
 * -----------------------------------------------------------------------
 */
export type ClaseDoc = {
  claseId: string;
  fecha: string; // YYYY-MM-DD
  hora: string;  // HH:mm
  duracionMinutos: number;
  pista?: string;
  tipo: TipoClase;
  capacidad: number;
  titulo?: string; // opcional, ej. "Clase de competición". Si vacío, la UI muestra los nombres de los alumnos asignados.
  alumnosIds: string[];
  alumnosAsistieron: string[];
  // Historial de quién canceló su plaza AVISANDO con antelación (solo
  // tiene sentido marcarlo en clases futuras — ver baja-con-cancelacion
  // en calendarioClient.ts). Sirve de base para el ranking de
  // cancelaciones del dashboard. Distinto de simplemente "quitar" a
  // alguien sin más explicación (ej. el profesor se equivocó al
  // asignarlo), que no se considera una cancelación del alumno.
  alumnosCancelaron: string[];
  listaEsperaIds: string[];
  estado: EstadoClase;
  recurrenciaId?: string;
  notas?: string;
  // Unión de los tagsIds de todos los alumnos en alumnosIds, calculada
  // y guardada al crear/editar la clase (no en tiempo real). Existe
  // porque un alumno NO puede leer el catálogo completo de otros
  // alumnos (reglas de privacidad), así que no puede calcular él mismo
  // qué huecos son compatibles con su tag. Guardando esta unión aquí,
  // el alumno solo compara sus propios tagsIds contra este campo,
  // sin necesitar leer fichas ajenas.
  tagsCompatibles: string[];
  // Marca si ya se envió el push de recordatorio 24h antes (ver
  // functions/src/recordatorioClases.ts). Evita reenviar el mismo
  // aviso si la Cloud Function se ejecuta varias veces dentro de la
  // ventana de detección.
  recordatorioEnviado?: boolean;
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/clasesRecurrentes/{reglaId} ======================= */
export type ClaseRecurrenteDoc = {
  reglaId: string;
  diaSemana: number; // 0-6 (0 = domingo)
  hora: string;
  duracionMinutos: number;
  pista?: string;
  tipo: TipoClase;
  capacidad: number;
  alumnosIds: string[];
  activa: boolean;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin?: string;   // YYYY-MM-DD, o indefinida si no se pone
  createdAt: Timestamp;
  createdBy: string;
};

/* ======================= /tenants/{tenantId}/pagos/{pagoId} ======================= */
export type MetodoPago = 'efectivo' | 'transferencia' | 'bizum' | 'otro';
export type TipoPago = 'bono' | 'suelta';

export type PagoDoc = {
  pagoId: string;
  alumnoId: string;
  tipo: TipoPago;
  bonoId?: string;
  claseId?: string;
  importe: number;
  metodo: MetodoPago;
  fecha: Timestamp;
  registradoPor: string;
};

/* ======================= /tenants/{tenantId}/notificaciones/{uid}/items/{notifId} ======================= */
export type TipoNotificacion = 'recordatorio_clase' | 'aviso_general';

/**
 * Copia in-app de los avisos enviados por push, para que el alumno
 * tenga histórico aunque su navegador no esté abierto cuando llega el
 * push (o si revocó el permiso de notificaciones del navegador, pero
 * sigue usando la app). El push y este documento se crean en la MISMA
 * Cloud Function (ver functions/src/recordatorioClases.ts).
 */
export type NotificacionDoc = {
  notifId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  claseId?: string;
  leida: boolean;
  createdAt: Timestamp;
};

/* ======================= helpers de contexto de sesión ======================= */
export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null; // resuelto a partir de tenantId, para construir rutas
  alumnoId: string | null;
  active: boolean;
};
