'use client';

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';

/**
 * pushClient.ts
 * -----------------------------------------------------------------------
 * Pide permiso de notificaciones al navegador, obtiene el token FCM, y
 * lo guarda en users/{uid}.fcmToken — mismo patrón que ya usa Padel
 * Planner. La Cloud Function de recordatorios (functions/src/
 * recordatorioClases.ts) lee ese campo para enviar el push.
 *
 * IMPORTANTE — piezas que faltan configurar antes de que esto funcione:
 * 1. Activar Cloud Messaging en la consola de Firebase del proyecto
 *    real (no en el emulador — FCM no funciona en local).
 * 2. Generar el par de claves VAPID en Firebase Console > Cloud
 *    Messaging > Certificados push web, y pegar la clave pública en
 *    VAPID_KEY más abajo.
 * 3. Crear el Service Worker public/firebase-messaging-sw.js (incluido
 *    en este mismo entregable) con la misma config de Firebase que
 *    lib/firebase.ts.
 * 4. El proyecto debe estar en plan Blaze para que la Cloud Function
 *    con scheduler pueda desplegarse y ejecutarse.
 * -----------------------------------------------------------------------
 */

// PENDIENTE: sustituir por la clave pública VAPID real una vez generada
// en Firebase Console > Cloud Messaging > Certificados push web.
const VAPID_KEY = 'BL-KiYHgaP8Px4IUMUQjw1PRg1m8L-wIpJYPfqH4vucmQqGadRVrhuR1943mtILwNnYU2m8O_8B0naCvCgR7xcU';

export type PedirPermisoResultado =
  | { ok: true; token: string }
  | { ok: false; motivo: 'no-soportado' | 'permiso-denegado' | 'error'; detalle?: string };

/**
 * Pide permiso de notificaciones al navegador (si no se ha pedido ya),
 * obtiene el token FCM, y lo guarda en el documento del usuario. Pensado
 * para llamarse desde un botón explícito ("Activar notificaciones") en
 * /mi-cuenta — nunca se pide permiso sin que el usuario lo haya pedido
 * primero, los navegadores penalizan/bloquean ese patrón.
 */
export async function pedirPermisoYGuardarToken(uid: string): Promise<PedirPermisoResultado> {
  try {
    const soportado = await isSupported();
    if (!soportado) {
      return { ok: false, motivo: 'no-soportado' };
    }

    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      return { ok: false, motivo: 'permiso-denegado' };
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

    if (!token) {
      return { ok: false, motivo: 'error', detalle: 'No se obtuvo token del navegador.' };
    }

    await updateDoc(doc(db, 'users', uid), {
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp(),
    });

    return { ok: true, token };
  } catch (e: any) {
    console.error('Error pidiendo permiso de notificaciones:', e);
    return { ok: false, motivo: 'error', detalle: e?.message };
  }
}

/**
 * Borra el token guardado (ej. el usuario desactiva notificaciones
 * desde un ajuste en la app). No revoca el permiso del navegador en sí
 * — eso solo lo puede hacer el usuario desde la configuración del
 * propio navegador — pero evita que se le sigan enviando push.
 */
export async function desactivarNotificaciones(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    fcmToken: null,
    fcmTokenUpdatedAt: serverTimestamp(),
  });
}

/**
 * Escucha notificaciones que llegan MIENTRAS la app está abierta en
 * primer plano (foreground). Si la app está cerrada o en segundo
 * plano, el Service Worker (public/firebase-messaging-sw.js) las
 * gestiona en su lugar — este listener no cubre ese caso.
 * Devuelve una función para des-suscribirse (llamar en cleanup de useEffect).
 */
export async function escucharNotificacionesEnPrimerPlano(
  onNotificacion: (titulo: string, cuerpo: string) => void
): Promise<() => void> {
  const soportado = await isSupported();
  if (!soportado) return () => {};

  const messaging = getMessaging(app);
  const unsub = onMessage(messaging, (payload) => {
    const titulo = payload.notification?.title || 'Kronorix';
    const cuerpo = payload.notification?.body || '';
    onNotificacion(titulo, cuerpo);
  });
  return unsub;
}
