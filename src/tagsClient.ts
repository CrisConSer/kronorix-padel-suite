import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * tagsClient.ts
 * -----------------------------------------------------------------------
 * CRUD de tags por tenant. Cada profesor gestiona su propio catálogo de
 * etiquetas (ej. "Iniciación", "Competición", "Paga tarde"...) y las
 * asigna libremente a sus alumnos. No hay Cloud Function aquí: es
 * escritura directa de Firestore, protegida por las reglas
 * (solo admin del tenant puede crear/editar/borrar).
 * -----------------------------------------------------------------------
 */

export type CrearTagInput = {
  nombre: string;
  color: string;
  createdBy: string;
};

export async function crearTag(tenantId: string, input: CrearTagInput): Promise<string> {
  const tagRef = doc(collection(db, 'tenants', tenantId, 'tags'));
  await setDoc(tagRef, {
    tagId: tagRef.id,
    nombre: input.nombre,
    color: input.color,
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
  });
  return tagRef.id;
}

export async function actualizarTag(
  tenantId: string,
  tagId: string,
  cambios: { nombre?: string; color?: string }
): Promise<void> {
  await updateDoc(doc(db, 'tenants', tenantId, 'tags', tagId), cambios);
}

export async function borrarTag(tenantId: string, tagId: string): Promise<void> {
  // Nota: esto NO quita automáticamente el tag de los alumnos que ya lo
  // tenían asignado (tagsIds seguiría conteniendo ese id huérfano). Para
  // esta primera versión lo dejamos así — el listado de alumnos ya
  // resuelve los chips contra el catálogo vivo de tags, así que un id
  // huérfano simplemente deja de mostrarse (no rompe nada), pero si se
  // quiere limpiar de verdad habría que hacerlo con una Cloud Function
  // que recorra los alumnos. Lo dejamos anotado para más adelante.
  await deleteDoc(doc(db, 'tenants', tenantId, 'tags', tagId));
}
