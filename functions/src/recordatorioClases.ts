/**
 * functions/src/recordatorioClases.ts
 * -----------------------------------------------------------------------
 * Cloud Function con SCHEDULER (firebase-functions v2): se ejecuta sola,
 * sin que nadie la llame, cada hora. Busca clases que empiezan dentro de
 * 23-25h a partir de "ahora" (ventana de 2h para no depender de que el
 * scheduler dispare en el minuto exacto) y envía un push a cada alumno
 * asignado que tenga fcmToken guardado.
 *
 * REQUIERE plan Blaze (los triggers de scheduler no funcionan en el
 * plan gratuito Spark) y Cloud Messaging activado en el proyecto real
 * — no funciona contra el emulador.
 *
 * Por qué una ventana de 2h y no exactamente 24h:
 * - El scheduler de Cloud Functions no garantiza ejecutarse en el
 *   segundo exacto programado (puede haber minutos de margen).
 * - Si comparáramos solo "exactamente 24h", una clase podría quedarse
 *   sin recordatorio si la función se ejecuta unos minutos tarde justo
 *   ese día. Con la ventana, cada clase entra en la ventana en AL MENOS
 *   una de las ejecuciones horarias.
 * - flagRecordatorioEnviado en la propia clase evita enviar el mismo
 *   aviso más de una vez si entra en la ventana en dos ejecuciones
 *   consecutivas.
 * -----------------------------------------------------------------------
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const VENTANA_INICIO_HORAS = 23;
const VENTANA_FIN_HORAS = 25;

export const recordatorioClases = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Europe/Madrid',
  },
  async () => {
    const ahora = new Date();
    const desde = new Date(ahora.getTime() + VENTANA_INICIO_HORAS * 60 * 60 * 1000);
    const hasta = new Date(ahora.getTime() + VENTANA_FIN_HORAS * 60 * 60 * 1000);

    // Recorremos todos los tenants activos. El volumen esperado (varios
    // profesores, cada uno con pocas clases por hora en la ventana) es
    // pequeño, así que no hace falta paginar todavía.
    const tenantsSnap = await db.collection('tenants').where('active', '==', true).get();

    for (const tenantDoc of tenantsSnap.docs) {
      await procesarTenant(tenantDoc.id, desde, hasta);
    }
  }
);

async function procesarTenant(tenantId: string, desde: Date, hasta: Date): Promise<void> {
  // Las clases se guardan con `fecha` (YYYY-MM-DD) y `hora` (HH:mm) por
  // separado, así que no podemos hacer un filtro de rango de Timestamp
  // directamente en la query. Acotamos por `fecha` a las dos fechas de
  // calendario que pueden caer en la ventana (hoy y mañana cubren los
  // casos reales para una ventana de ~2h en torno a las 24h vista) y
  // afinamos la comparación exacta de fecha+hora en memoria.
  const fechasABuscar = new Set([ymd(desde), ymd(hasta)]);

  const clasesRef = db.collection('tenants').doc(tenantId).collection('clases');
  const snaps = await Promise.all(
    Array.from(fechasABuscar).map((f) => clasesRef.where('fecha', '==', f).get())
  );

  for (const snap of snaps) {
    for (const claseDoc of snap.docs) {
      const clase = claseDoc.data();
      if (clase.estado !== 'programada') continue;
      if (clase.recordatorioEnviado === true) continue;

      const fechaHoraClase = combinarFechaHora(clase.fecha, clase.hora);
      if (fechaHoraClase < desde || fechaHoraClase > hasta) continue;
      if (!Array.isArray(clase.alumnosIds) || clase.alumnosIds.length === 0) continue;

      await enviarRecordatorio(tenantId, claseDoc.id, clase);
    }
  }
}

async function enviarRecordatorio(tenantId: string, claseId: string, clase: any): Promise<void> {
  const alumnosIds: string[] = clase.alumnosIds;

  // Necesitamos el fcmToken de cada alumno, que vive en users/{uid} —
  // pero solo tenemos alumnoId, no uid. Buscamos en alumnos/{alumnoId}
  // para sacar el uid, y de ahí el token.
  const alumnosSnaps = await Promise.all(
    alumnosIds.map((alumnoId) =>
      db.collection('tenants').doc(tenantId).collection('alumnos').doc(alumnoId).get()
    )
  );

  const uids = alumnosSnaps
    .map((s) => (s.exists ? (s.data() as any).uid : null))
    .filter((uid): uid is string => !!uid);

  if (uids.length === 0) {
    // Nadie tiene login propio todavía (uid null) — no hay a quién
    // enviarle push. Marcamos como enviado igualmente para no
    // reintentarlo cada hora sin sentido.
    await marcarComoEnviado(tenantId, claseId);
    return;
  }

  const usersSnaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));

  const tokens = usersSnaps
    .map((s) => (s.exists ? (s.data() as any).fcmToken : null))
    .filter((t): t is string => !!t);

  if (tokens.length > 0) {
    const titulo = 'Recordatorio de clase';
    const cuerpo = `Tienes una clase mañana a las ${clase.hora}${clase.pista ? ` (${clase.pista})` : ''}.`;

    try {
      await messaging.sendEachForMulticast({
        tokens,
        notification: { title: titulo, body: cuerpo },
        data: { claseId, tenantId, tipo: 'recordatorio_clase' },
      });
    } catch (e) {
      console.error(`Error enviando push para clase ${claseId} del tenant ${tenantId}:`, e);
      // No relanzamos el error: preferimos marcar como enviado e
      // intentar con el resto de clases, que un fallo de un push no
      // bloquee la ejecución completa de la función para todo el tenant.
    }
  }

  await marcarComoEnviado(tenantId, claseId);
}

async function marcarComoEnviado(tenantId: string, claseId: string): Promise<void> {
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection('clases')
    .doc(claseId)
    .update({ recordatorioEnviado: true });
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function combinarFechaHora(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
