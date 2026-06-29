'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { app } from '@/lib/firebase';

export type CrearProfesorInput = {
  nombreProfesor: string;
  nombreNegocio: string;
  email: string;
  telefono?: string;
  slug: string;
};

export type CrearProfesorResult = {
  tenantId: string;
  uid: string;
  slug: string;
};

/**
 * Llama a la Cloud Function `crearProfesor` y, si tiene éxito, dispara
 * el email de "establece tu contraseña" reutilizando el flujo que ya
 * usa Padel Planner (sendPasswordResetEmail). Así el profesor nunca ve
 * ni necesita la contraseña provisional generada en el servidor.
 */
export async function crearProfesorYEnviarInvitacion(
  input: CrearProfesorInput
): Promise<CrearProfesorResult> {
  const functions = getFunctions(app);
  const crearProfesorFn = httpsCallable<CrearProfesorInput, CrearProfesorResult>(
    functions,
    'crearProfesor'
  );

  const { data } = await crearProfesorFn(input);

  try {
    await sendPasswordResetEmail(auth, input.email);
  } catch (e) {
    // El profesor ya está creado aunque el email falle; lo registramos
    // pero no rompemos el flujo — desde el panel del super admin se
    // puede reenviar la invitación.
    console.error('Profesor creado, pero falló el envío del email de invitación:', e);
  }

  return data;
}

/** Normaliza un nombre de negocio a un slug válido, como ayuda en el formulario. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}
