import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ModalidadAlumno } from './types';

/**
 * alumnosClient.ts
 * -----------------------------------------------------------------------
 * crearAlumno: alta inicial (sin Cloud Function). actualizarAlumno:
 * edición de una ficha ya existente — nombre, email, teléfono, nivel,
 * modalidad, notas y tags. Separado de crearAlumno porque la UI de
 * edición es un formulario distinto (modal), y porque edición nunca
 * debe poder cambiar `estado`/`fechaBaja` (eso lo hace el flujo de dar
 * de baja/reactivar, ver AlumnosPage) ni `createdBy`/`createdAt`
 * (histórico, no se toca).
 *
 * Crear la FICHA del alumno no requiere Auth — el alumno puede existir
 * solo como ficha (alumnoId) sin login propio, así que esto se hace
 * directamente desde el cliente con el SDK normal. La invitación para
 * darle acceso a la app (crear su usuario de Auth y enviarle el email)
 * SÍ requiere Cloud Function — ver invitarAlumnoClient.ts, que la
 * página de Alumnos llama automáticamente justo después de crear la
 * ficha, si el alumno tiene email.
 * -----------------------------------------------------------------------
 */

export type CrearAlumnoInput = {
  nombre: string;
  email?: string;
  telefono?: string;
  nivel?: string;
  modalidad: ModalidadAlumno;
  notas?: string;
  tagsIds: string[];
  createdBy: string;
};

export async function crearAlumno(tenantId: string, input: CrearAlumnoInput): Promise<string> {
  const alumnoRef = doc(collection(db, 'tenants', tenantId, 'alumnos'));

  await setDoc(alumnoRef, {
    alumnoId: alumnoRef.id,
    uid: null,
    nombre: input.nombre,
    email: input.email || null,
    telefono: input.telefono || null,
    nivel: input.nivel || null,
    fechaAlta: serverTimestamp(),
    fechaBaja: null,
    estado: 'activo',
    modalidad: input.modalidad,
    bonoActualId: null,
    notas: input.notas || '',
    tagsIds: input.tagsIds || [],
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
  });

  return alumnoRef.id;
}

export type EditarAlumnoInput = {
  nombre: string;
  email?: string;
  telefono?: string;
  nivel?: string;
  modalidad: ModalidadAlumno;
  notas?: string;
  tagsIds: string[];
};

export async function actualizarAlumno(
  tenantId: string,
  alumnoId: string,
  input: EditarAlumnoInput
): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId, 'alumnos', alumnoId), {
    nombre: input.nombre,
    email: input.email || null,
    telefono: input.telefono || null,
    nivel: input.nivel || null,
    modalidad: input.modalidad,
    notas: input.notas || '',
    tagsIds: input.tagsIds || [],
  });
}
