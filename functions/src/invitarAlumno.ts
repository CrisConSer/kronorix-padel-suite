/**
 * functions/src/invitarAlumno.ts
 * -----------------------------------------------------------------------
 * Cloud Function callable (firebase-functions v2): SOLO el admin del
 * tenant al que pertenece el alumno puede invocarla. Hace, de forma
 * atómica:
 *   1. Si el alumno ya tiene uid (ya fue invitado antes), NO crea un
 *      usuario nuevo — solo reenvía el email de "establece tu
 *      contraseña" al usuario de Auth existente. Esto cubre el caso de
 *      "se le borró el email o no le llegó", sin duplicar cuentas.
 *   2. Si el alumno NO tiene uid todavía, crea su usuario en Firebase
 *      Auth (con contraseña provisional, igual que crearProfesor),
 *      crea su doc /users/{uid} con role='alumno' y los datos de
 *      tenant/alumno correctos, actualiza alumnos/{alumnoId}.uid, y
 *      envía el email de invitación.
 *
 * Por qué Cloud Function y no desde el cliente:
 * - Crear un usuario de Firebase Auth en nombre de otra persona requiere
 *   el Admin SDK — el SDK de cliente no lo permite.
 * - Si esto se hiciera en pasos sueltos desde el cliente y algo falla a
 *   mitad, quedaría un usuario de Auth huérfano sin vincular a su ficha
 *   de alumno, o una ficha con un uid que no existe de verdad en Auth.
 * -----------------------------------------------------------------------
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

type InvitarAlumnoInput = {
  tenantId: string;
  alumnoId: string;
};

type InvitarAlumnoResult = {
  uid: string;
  reenvio: boolean; // true si el alumno ya tenía cuenta y solo se reenvió el email
};

export const invitarAlumno = onCall<InvitarAlumnoInput>(async (request) => {
  const { auth, data } = request;

  // 1) Debe estar autenticado.
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { tenantId, alumnoId } = data || ({} as InvitarAlumnoInput);
  if (!tenantId?.trim() || !alumnoId?.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan datos del alumno o del tenant.');
  }

  // 2) Quien llama debe ser admin de ESE tenant concreto (no de otro,
  // y no basta con ser super admin — los super admins no gestionan
  // alumnos, por diseño de privacidad de la plataforma).
  const callerUserSnap = await db.doc(`users/${auth.uid}`).get();
  if (!callerUserSnap.exists) {
    throw new HttpsError('permission-denied', 'No se encontró tu perfil de usuario.');
  }
  const callerUser = callerUserSnap.data() as { role?: string; tenantId?: string; active?: boolean };
  if (callerUser.role !== 'admin' || callerUser.tenantId !== tenantId || !callerUser.active) {
    throw new HttpsError(
      'permission-denied',
      'Solo el profesor de este tenant puede invitar a sus alumnos.'
    );
  }

  // 3) El alumno debe existir en ese tenant.
  const alumnoRef = db.doc(`tenants/${tenantId}/alumnos/${alumnoId}`);
  const alumnoSnap = await alumnoRef.get();
  if (!alumnoSnap.exists) {
    throw new HttpsError('not-found', 'Ese alumno no existe.');
  }
  const alumno = alumnoSnap.data() as { nombre?: string; email?: string; uid?: string | null };

  if (!alumno.email?.trim()) {
    throw new HttpsError(
      'failed-precondition',
      'Este alumno no tiene email registrado. Añade un email a su ficha antes de invitarlo.'
    );
  }

  // ----- Caso A: ya tiene cuenta -> el cliente reenviará el email -----
  // (ver invitarAlumnoClient.ts: tras llamar a esta función, el cliente
  // siempre dispara sendPasswordResetEmail con el email del alumno).
  if (alumno.uid) {
    return { uid: alumno.uid, reenvio: true } satisfies InvitarAlumnoResult;
  }

  // ----- Caso B: no tiene cuenta -> crearla entera -----
  let newUserRecord: admin.auth.UserRecord;
  try {
    newUserRecord = await admin.auth().createUser({
      email: alumno.email,
      displayName: alumno.nombre || 'Alumno/a',
      password: generateTemporaryPassword(),
    });
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError(
        'already-exists',
        'Ya existe una cuenta con ese email (puede que sea admin de otro tenant o ya esté en uso).'
      );
    }
    throw new HttpsError('internal', 'No se pudo crear el usuario de autenticación.');
  }

  try {
    await db.runTransaction(async (tx) => {
      tx.set(db.doc(`users/${newUserRecord.uid}`), {
        uid: newUserRecord.uid,
        email: alumno.email,
        displayName: alumno.nombre || 'Alumno/a',
        role: 'alumno',
        tenantId,
        alumnoId,
        fcmToken: null,
        fcmTokenUpdatedAt: null,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.uid,
      });
      tx.update(alumnoRef, { uid: newUserRecord.uid });
    });
  } catch (e) {
    // Si falla la escritura en Firestore, no dejamos un usuario de Auth huérfano.
    await admin.auth().deleteUser(newUserRecord.uid).catch(() => {});
    throw new HttpsError('internal', 'No se pudo completar la invitación del alumno.');
  }

  // El cliente (invitarAlumnoClient.ts) es quien dispara
  // sendPasswordResetEmail justo después de que esta función resuelva
  // con éxito — mismo patrón ya usado en crearProfesorClient.ts.
  return { uid: newUserRecord.uid, reenvio: false } satisfies InvitarAlumnoResult;
});

function generateTemporaryPassword(): string {
  // Nunca se usa para entrar: el alumno siempre establece la suya vía
  // el enlace de restablecimiento. Solo necesita cumplir el mínimo de Auth.
  return `Tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
