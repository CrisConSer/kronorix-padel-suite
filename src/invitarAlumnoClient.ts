'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { app, auth } from '@/lib/firebase';

/**
 * invitarAlumnoClient.ts
 * -----------------------------------------------------------------------
 * Llama a la Cloud Function `invitarAlumno` y, si tiene éxito (ya sea
 * creando la cuenta por primera vez o reenviando a una ya existente),
 * dispara sendPasswordResetEmail desde el cliente — mismo patrón que ya
 * usa crearProfesorClient.ts para profesores. Así el alumno nunca ve ni
 * necesita la contraseña provisional generada en el servidor.
 * -----------------------------------------------------------------------
 */

export type InvitarAlumnoInput = {
  tenantId: string;
  alumnoId: string;
};

export type InvitarAlumnoResult = {
  uid: string;
  reenvio: boolean;
};

export async function invitarAlumnoYEnviarEmail(
  input: InvitarAlumnoInput,
  emailAlumno: string
): Promise<InvitarAlumnoResult> {
  const functions = getFunctions(app);
  const invitarAlumnoFn = httpsCallable<InvitarAlumnoInput, InvitarAlumnoResult>(
    functions,
    'invitarAlumno'
  );

  const { data } = await invitarAlumnoFn(input);

  try {
    await sendPasswordResetEmail(auth, emailAlumno);
  } catch (e) {
    // El alumno ya está creado/vinculado aunque el email falle; se
    // puede reintentar con el mismo botón "Invitar" desde la ficha.
    console.error('Alumno invitado, pero falló el envío del email:', e);
    throw new Error(
      'Se ha creado el acceso, pero no se pudo enviar el email. Inténtalo de nuevo en unos minutos.'
    );
  }

  return data;
}
