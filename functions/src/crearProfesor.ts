/**
 * functions/src/crearProfesor.ts
 * -----------------------------------------------------------------------
 * Cloud Function callable (firebase-functions v2): SOLO el super admin
 * puede invocarla. Crea, de forma atómica:
 *   1. El usuario en Firebase Auth (con contraseña provisional)
 *   2. El doc /tenants/{tenantId}
 *   3. El doc /users/{uid} con role='admin' y tenantId apuntando al tenant
 *
 * Por qué Cloud Function y no hacerlo desde el cliente:
 * - Crear un usuario de Firebase Auth en nombre de otra persona requiere
 *   el Admin SDK (privilegios de servidor), el SDK de cliente no lo permite.
 * - Si esto se hiciera en 2-3 pasos sueltos desde el cliente (crear auth,
 *   luego doc de tenant, luego doc de user) y algo falla a mitad, quedaría
 *   un usuario de Auth "huérfano" sin tenant, o un tenant sin admin.
 *   Aquí se revierte todo si cualquier paso falla.
 * -----------------------------------------------------------------------
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const SLUG_REGEX = /^[a-z0-9-]{3,40}$/;

type CrearProfesorInput = {
  nombreProfesor: string;
  nombreNegocio: string;
  email: string;
  telefono?: string;
  slug: string; // ej. "pablomiki" -> validado contra SLUG_REGEX
};

export const crearProfesor = onCall<CrearProfesorInput>(async (request) => {
  const { auth, data } = request;

  // 1) Solo un super admin autenticado puede llamar a esto.
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const callerSnap = await db.doc(`platformAdmins/${auth.uid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Solo un super administrador puede crear profesores.'
    );
  }

  // 2) Validación de entrada
  const { nombreProfesor, nombreNegocio, email, telefono, slug } = data || ({} as CrearProfesorInput);

  if (!nombreProfesor?.trim() || !nombreNegocio?.trim() || !email?.trim()) {
    throw new HttpsError('invalid-argument', 'Faltan campos obligatorios.');
  }
  if (!SLUG_REGEX.test(slug || '')) {
    throw new HttpsError(
      'invalid-argument',
      'El slug debe tener entre 3 y 40 caracteres, solo minúsculas, números y guiones.'
    );
  }

  // 3) Slug único: comprobamos antes de crear nada en Auth.
  const slugQuery = await db.collection('tenants').where('slug', '==', slug).limit(1).get();
  if (!slugQuery.empty) {
    throw new HttpsError('already-exists', `El slug "${slug}" ya está en uso.`);
  }

  // 4) Crear el usuario en Firebase Auth con contraseña provisional.
  //    El profesor la cambiará en su primer login (flujo estándar de
  //    "restablecer contraseña" reutilizando sendPasswordResetEmail,
  //    igual que ya hace Padel Planner).
  let newUserRecord: admin.auth.UserRecord;
  try {
    newUserRecord = await admin.auth().createUser({
      email,
      displayName: nombreProfesor,
      password: generateTemporaryPassword(),
    });
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ya existe una cuenta con ese email.');
    }
    throw new HttpsError('internal', 'No se pudo crear el usuario de autenticación.');
  }

  const tenantRef = db.collection('tenants').doc();
  const userRef = db.collection('users').doc(newUserRecord.uid);

  try {
    await db.runTransaction(async (tx) => {
      tx.set(tenantRef, {
        tenantId: tenantRef.id,
        slug,
        nombreProfesor,
        nombreNegocio,
        email,
        telefono: telefono || null,
        branding: {
          colorPrimario: '#E8A020', // Amber Gold de Kronorix por defecto
          colorSecundario: '#09090F',
        },
        config: {
          duracionClaseMinutos: 60,
          avisoCancelacionHoras: 24,
          monedaSimbolo: '€',
        },
        plan: 'trial',
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.uid,
      });

      tx.set(userRef, {
        uid: newUserRecord.uid,
        email,
        displayName: nombreProfesor,
        role: 'admin',
        tenantId: tenantRef.id,
        alumnoId: null,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.uid,
      });
    });
  } catch (e) {
    // Si falla la escritura en Firestore, no dejamos un usuario de Auth huérfano.
    await admin.auth().deleteUser(newUserRecord.uid).catch(() => {});
    throw new HttpsError('internal', 'No se pudo completar el alta del profesor.');
  }

  // 5) Enviar email para que el profesor establezca su contraseña.
  //    (En el cliente: llamar a sendPasswordResetEmail(auth, email) justo
  //    después de invocar esta función, igual que el flujo ya existente.)

  return {
    tenantId: tenantRef.id,
    uid: newUserRecord.uid,
    slug,
  };
});

function generateTemporaryPassword(): string {
  // Nunca se usa para entrar: el profesor siempre establece la suya vía
  // email de restablecimiento. Solo necesita cumplir el mínimo de Auth.
  return `Tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
