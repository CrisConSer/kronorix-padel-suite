import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AlumnoDoc, ClaseDoc, TipoClase } from './types';

/**
 * calendarioClient.ts
 * -----------------------------------------------------------------------
 * Lógica de negocio del calendario, migrada del patrón de Padel Planner
 * (transacciones para evitar condiciones de carrera en cupos y lista de
 * espera) pero adaptada al modelo acordado:
 *
 * - La clase nace con alumnos YA asignados por el profesor.
 * - Si quedan plazas libres (capacidad > alumnosIds.length), ese hueco
 *   se ofrece SOLO a alumnos que comparten al menos 1 tag con los ya
 *   asignados — alumnosCompatiblesConHueco() calcula esa lista; no se
 *   guarda en el documento, se deriva en el momento.
 * - listaEsperaIds es para cuando el cupo YA está cubierto pero se
 *   quiere un suplente. Si alguien de alumnosIds se da de baja, el
 *   primero de listaEsperaIds se promociona automáticamente (mismo
 *   patrón de runTransaction que ya usa Padel Planner para esto).
 * -----------------------------------------------------------------------
 */

// ===================== Crear clase =====================

export type CrearClaseInput = {
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  duracionMinutos: number;
  pista?: string;
  tipo: TipoClase;
  capacidad: number;
  alumnosIds: string[];
  titulo?: string;
  notas?: string;
  createdBy: string;
  // Catálogo de alumnos del tenant, para derivar tagsCompatibles.
  // Lo pasamos desde la página (ya lo tiene cargado) en vez de volver
  // a leerlo aquí, para no gastar otra lectura de Firestore.
  catalogoAlumnos: AlumnoDoc[];
  // Si el profesor elige explícitamente un tag/nivel para la clase (ej.
  // "Intermedio"), se usa ESE como único tagsCompatibles, en vez de la
  // unión de tags de los alumnos asignados. Esto evita que mezclar
  // alumnos de niveles distintos en una misma clase amplíe sin querer
  // los huecos a niveles que no tocan.
  tagFiltroId?: string;
};

function calcularTagsCompatibles(alumnosIds: string[], catalogoAlumnos: AlumnoDoc[]): string[] {
  const set = new Set<string>();
  const porId = new Map(catalogoAlumnos.map((a) => [a.alumnoId, a]));
  alumnosIds.forEach((id) => {
    const alumno = porId.get(id);
    (alumno?.tagsIds || []).forEach((t) => set.add(t));
  });
  return Array.from(set);
}

export async function crearClase(tenantId: string, input: CrearClaseInput): Promise<string> {
  const claseRef = doc(collection(db, 'tenants', tenantId, 'clases'));
  const tagsCompatibles = input.tagFiltroId
    ? [input.tagFiltroId]
    : calcularTagsCompatibles(input.alumnosIds, input.catalogoAlumnos);

  await runTransaction(db, async (tx) => {
    tx.set(claseRef, {
      claseId: claseRef.id,
      fecha: input.fecha,
      hora: input.hora,
      duracionMinutos: input.duracionMinutos,
      pista: input.pista || null,
      tipo: input.tipo,
      capacidad: input.capacidad,
      titulo: input.titulo || null,
      alumnosIds: input.alumnosIds,
      alumnosAsistieron: [],
      alumnosCancelaron: [],
      listaEsperaIds: [],
      estado: 'programada',
      notas: input.notas || '',
      tagsCompatibles,
      recordatorioEnviado: false,
      createdAt: serverTimestamp(),
      createdBy: input.createdBy,
    });
  });
  return claseRef.id;
}

// ===================== Editar clase (admin, edición completa) =====================

export type ActualizarClaseInput = {
  fecha: string;
  hora: string;
  duracionMinutos: number;
  pista?: string;
  tipo: TipoClase;
  capacidad: number;
  alumnosIds: string[];
  titulo?: string;
  notas?: string;
  catalogoAlumnos: AlumnoDoc[];
  tagFiltroId?: string;
};

/**
 * Edición completa de una clase ya creada (solo admin — reforzado por
 * regla de seguridad, que ya distingue admin de alumno en /clases).
 * Si se reduce la capacidad o cambian los alumnos asignados, puede
 * dejar a alguien de listaEsperaIds en una situación rara (ej. la
 * clase ya no tiene hueco porque ahora hay más asignados que antes);
 * para esta primera versión no se auto-limpia la lista de espera al
 * editar — el profesor la revisa manualmente si hiciera falta.
 */
export async function actualizarClase(
  tenantId: string,
  claseId: string,
  input: ActualizarClaseInput
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);
  const tagsCompatibles = input.tagFiltroId
    ? [input.tagFiltroId]
    : calcularTagsCompatibles(input.alumnosIds, input.catalogoAlumnos);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(claseRef);
    if (!snap.exists()) throw new Error('La clase ya no existe.');
    const claseActual = snap.data() as ClaseDoc;
    if (input.alumnosIds.length > input.capacidad) {
      throw new Error('Has asignado más alumnos de los que permite el cupo.');
    }

    const fechaOHoraCambio = claseActual.fecha !== input.fecha || claseActual.hora !== input.hora;

    tx.update(claseRef, {
      fecha: input.fecha,
      hora: input.hora,
      duracionMinutos: input.duracionMinutos,
      pista: input.pista || null,
      tipo: input.tipo,
      capacidad: input.capacidad,
      titulo: input.titulo || null,
      alumnosIds: input.alumnosIds,
      notas: input.notas || '',
      tagsCompatibles,
      // Si cambia fecha u hora, el recordatorio ya enviado (si lo
      // hubiera) correspondía al horario antiguo — lo reseteamos para
      // que la Cloud Function lo reevalúe con el nuevo horario.
      ...(fechaOHoraCambio ? { recordatorioEnviado: false } : {}),
    });
  });
}

// ===================== Compatibilidad por tags =====================

/**
 * Dado el conjunto de tags compatibles ya guardado en la clase
 * (clase.tagsCompatibles — fijado al crearla, ya sea por el tag
 * elegido explícitamente o por la unión de tags de los asignados) y el
 * catálogo completo de alumnos del tenant, devuelve los alumnos que:
 * - NO están ya asignados a la clase (ni en lista de espera)
 * - comparten al menos 1 tag con tagsCompatibles
 * - están activos (no de baja)
 *
 * Usamos el campo ya persistido (en vez de recalcular desde los
 * asignados en el momento) para que esto sea siempre consistente con
 * lo que ve el alumno en /mi-cuenta, que solo puede leer ese campo.
 */
export function alumnosCompatiblesConHueco(
  clase: ClaseDoc,
  catalogoAlumnos: AlumnoDoc[]
): AlumnoDoc[] {
  const idsExcluidos = new Set([...clase.alumnosIds, ...clase.listaEsperaIds]);
  const tagsCompatibles = clase.tagsCompatibles || [];
  if (tagsCompatibles.length === 0) return [];

  return catalogoAlumnos.filter((candidato) => {
    if (candidato.estado !== 'activo') return false;
    if (idsExcluidos.has(candidato.alumnoId)) return false;
    return (candidato.tagsIds || []).some((t) => tagsCompatibles.includes(t));
  });
}

// ===================== Apuntarse a un hueco =====================

/**
 * El alumno se apunta a sí mismo a un hueco libre. Usa una transacción
 * para que, si dos alumnos compatibles intentan apuntarse al mismo
 * hueco a la vez, solo uno de los dos gane la plaza (el segundo recibe
 * un error y la UI debe explicarle que ya se cubrió).
 *
 * También valida aquí mismo (no solo a nivel de regla) que el alumno
 * comparte al menos un tag con tagsCompatibles de la clase — así un
 * alumno no puede apuntarse a un hueco que no le corresponde aunque
 * intentara llamar a esta función directamente sin pasar por la UI
 * que ya filtra.
 */
export async function apuntarseAClase(
  tenantId: string,
  claseId: string,
  alumnoId: string,
  misTagsIds: string[]
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(claseRef);
    if (!snap.exists()) throw new Error('La clase ya no existe.');
    const clase = snap.data() as ClaseDoc;

    if (clase.alumnosIds.includes(alumnoId)) {
      throw new Error('Ya estás apuntado a esta clase.');
    }
    if (clase.alumnosIds.length >= clase.capacidad) {
      throw new Error('Esta clase ya no tiene plazas libres.');
    }
    if (clase.estado !== 'programada') {
      throw new Error('Esta clase ya no admite cambios.');
    }
    const compatible = (clase.tagsCompatibles || []).some((t) => misTagsIds.includes(t));
    if (!compatible) {
      throw new Error('Esta clase no es compatible con tu nivel/categoría.');
    }

    tx.update(claseRef, {
      alumnosIds: [...clase.alumnosIds, alumnoId],
    });
  });
}

// ===================== Apuntar a la lista de espera =====================

export async function apuntarseAListaEspera(
  tenantId: string,
  claseId: string,
  alumnoId: string,
  misTagsIds: string[]
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(claseRef);
    if (!snap.exists()) throw new Error('La clase ya no existe.');
    const clase = snap.data() as ClaseDoc;

    if (clase.alumnosIds.includes(alumnoId)) {
      throw new Error('Ya estás apuntado a esta clase.');
    }
    if (clase.listaEsperaIds.includes(alumnoId)) {
      throw new Error('Ya estás en la lista de espera.');
    }
    const compatible = (clase.tagsCompatibles || []).some((t) => misTagsIds.includes(t));
    if (!compatible) {
      throw new Error('Esta clase no es compatible con tu nivel/categoría.');
    }

    tx.update(claseRef, {
      listaEsperaIds: [...clase.listaEsperaIds, alumnoId],
    });
  });
}

// ===================== Baja de un alumno (con promoción automática) =====================

/**
 * Da de baja a un alumno de una clase. Si había alguien en la lista de
 * espera, promociona automáticamente al primero de la lista a
 * alumnosIds — mismo patrón que la promoción de lista de espera ya
 * validada en Padel Planner.
 *
 * Recalcula tagsCompatibles tras el cambio. Si quien llama no tiene
 * acceso al catálogo completo (un alumno dándose de baja a sí mismo),
 * se puede omitir `catalogoAlumnos`; en ese caso tagsCompatibles NO se
 * recalcula (se deja como estaba) — la próxima vez que el profesor
 * edite la clase desde el calendario sí se recalculará con el catálogo
 * completo. Esto es una limitación aceptada para no forzar al alumno a
 * leer fichas de otros alumnos.
 *
 * `marcarComoCancelacion`: si es true, además de quitar al alumno se
 * añade su id a `alumnosCancelaron` — esto alimenta el ranking de
 * cancelaciones del dashboard. Solo tiene sentido para clases futuras
 * (avisó con antelación); la UI decide cuándo ofrecer esta opción, esta
 * función no valida la fecha por sí misma.
 */
export async function darBajaDeClase(
  tenantId: string,
  claseId: string,
  alumnoId: string,
  catalogoAlumnos?: AlumnoDoc[],
  marcarComoCancelacion = false
): Promise<{ promocionado: string | null }> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(claseRef);
    if (!snap.exists()) throw new Error('La clase ya no existe.');
    const clase = snap.data() as ClaseDoc;

    if (!clase.alumnosIds.includes(alumnoId)) {
      throw new Error('Ese alumno no está apuntado a esta clase.');
    }

    const nuevosAlumnos = clase.alumnosIds.filter((id) => id !== alumnoId);
    const listaEspera = [...clase.listaEsperaIds];
    let promocionado: string | null = null;

    if (listaEspera.length > 0) {
      promocionado = listaEspera.shift()!;
      nuevosAlumnos.push(promocionado);
    }

    const cambios: Record<string, unknown> = {
      alumnosIds: nuevosAlumnos,
      listaEsperaIds: listaEspera,
    };
    if (catalogoAlumnos) {
      cambios.tagsCompatibles = calcularTagsCompatibles(nuevosAlumnos, catalogoAlumnos);
    }
    if (marcarComoCancelacion && !(clase.alumnosCancelaron || []).includes(alumnoId)) {
      cambios.alumnosCancelaron = [...(clase.alumnosCancelaron || []), alumnoId];
    }

    tx.update(claseRef, cambios);

    return { promocionado };
  });
}

// ===================== Quitar de la lista de espera (sin baja) =====================

export async function quitarseDeListaEspera(
  tenantId: string,
  claseId: string,
  alumnoId: string
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(claseRef);
    if (!snap.exists()) throw new Error('La clase ya no existe.');
    const clase = snap.data() as ClaseDoc;
    tx.update(claseRef, {
      listaEsperaIds: clase.listaEsperaIds.filter((id) => id !== alumnoId),
    });
  });
}

// ===================== Cancelar clase (profesor) =====================

export async function cancelarClase(tenantId: string, claseId: string): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);
  await runTransaction(db, async (tx) => {
    tx.update(claseRef, { estado: 'cancelada_profesor' });
  });
}
