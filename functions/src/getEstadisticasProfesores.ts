/**
 * functions/src/getEstadisticasProfesores.ts
 * -----------------------------------------------------------------------
 * Cloud Function callable: SOLO el super admin puede invocarla.
 *
 * Devuelve, para CADA tenant, exclusivamente números agregados:
 *   - totalAlumnos   → count() sobre tenants/{id}/alumnos
 *   - totalClases    → count() sobre tenants/{id}/clases
 *   - ultimaActividad → fecha de la clase más reciente creada/editada
 *   - estado         → 'activo' | 'atencion' | 'inactivo' (semáforo)
 *
 * IMPORTANTE — por qué esto respeta el diseño original:
 * Usamos `count()` de Firestore, que se resuelve en el propio servidor de
 * Firestore y NUNCA transfiere los documentos en sí. El super admin nunca
 * ve un nombre de alumno, una nota o un pago; solo cuántos hay y cuándo
 * fue la última vez que hubo movimiento. Es la misma frontera de privacidad
 * que ya está documentada en docs/02-rutas-y-roles.md.
 * -----------------------------------------------------------------------
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

// Umbrales del semáforo de actividad (en días desde la última clase)
const DIAS_ATENCION = 7;
const DIAS_INACTIVO = 21;

type EstadoActividad = 'activo' | 'atencion' | 'inactivo' | 'sin-datos';

export type EstadisticasTenant = {
  tenantId: string;
  totalAlumnos: number;
  totalClases: number;
  ultimaActividad: string | null; // ISO string, o null si nunca hubo clases
  estado: EstadoActividad;
};

function calcularEstado(ultimaActividad: Date | null): EstadoActividad {
  if (!ultimaActividad) return 'sin-datos';
  const diasSinActividad =
    (Date.now() - ultimaActividad.getTime()) / (1000 * 60 * 60 * 24);
  if (diasSinActividad <= DIAS_ATENCION) return 'activo';
  if (diasSinActividad <= DIAS_INACTIVO) return 'atencion';
  return 'inactivo';
}

export const getEstadisticasProfesores = functions.https.onCall(
  async (_data, context) => {
    // 1) Solo un super admin autenticado puede llamar a esto.
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.'
      );
    }
    const callerDoc = await db.doc(`users/${context.auth.uid}`).get();
    if (callerDoc.data()?.role !== 'super_admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Solo el super admin puede ver estadísticas de profesores.'
      );
    }

    // 2) Traer todos los tenants (solo metadatos, ya lo hace ProfesoresPage)
    const tenantsSnap = await db.collection('tenants').get();

    // 3) Para cada tenant, contar en paralelo alumnos y clases + última clase
    const resultados: EstadisticasTenant[] = await Promise.all(
      tenantsSnap.docs.map(async (tenantDoc) => {
        const tenantId = tenantDoc.id;
        const alumnosRef = db.collection(`tenants/${tenantId}/alumnos`);
        const clasesRef = db.collection(`tenants/${tenantId}/clases`);

        const [alumnosCount, clasesCount, ultimaClaseSnap] = await Promise.all([
          alumnosRef.count().get(),
          clasesRef.count().get(),
          clasesRef.orderBy('actualizadoEn', 'desc').limit(1).get(),
        ]);

        const ultimaActividadDate = ultimaClaseSnap.empty
          ? null
          : (ultimaClaseSnap.docs[0].data().actualizadoEn?.toDate?.() ?? null);

        return {
          tenantId,
          totalAlumnos: alumnosCount.data().count,
          totalClases: clasesCount.data().count,
          ultimaActividad: ultimaActividadDate
            ? ultimaActividadDate.toISOString()
            : null,
          estado: calcularEstado(ultimaActividadDate),
        };
      })
    );

    return { estadisticas: resultados };
  }
);
