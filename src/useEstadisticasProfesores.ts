'use client';

import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';
import type { EstadisticasTenant } from './ProfesorStatsCard';

/**
 * src/useEstadisticasProfesores.ts
 * -----------------------------------------------------------------------
 * Hook que llama a la Cloud Function getEstadisticasProfesores UNA VEZ
 * al montar la página, y devuelve un mapa tenantId -> estadísticas para
 * que ProfesoresPage lo cruce con el listado que ya tiene por onSnapshot.
 *
 * No usamos onSnapshot aquí a propósito: contar documentos en tiempo real
 * para todos los tenants en cada cambio sería caro. Se recalcula al cargar
 * la página o al pulsar "Actualizar".
 * -----------------------------------------------------------------------
 */
export function useEstadisticasProfesores(activo: boolean) {
  const [porTenant, setPorTenant] = useState<Record<string, EstadisticasTenant>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refrescarEn, setRefrescarEn] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setLoading(true);
    setError(null);

    const fn = httpsCallable(getFunctions(app), 'getEstadisticasProfesores');
    fn()
      .then((res) => {
        if (cancelado) return;
        const data = res.data as { estadisticas: EstadisticasTenant[] };
        const mapa: Record<string, EstadisticasTenant> = {};
        data.estadisticas.forEach((e) => (mapa[e.tenantId] = e));
        setPorTenant(mapa);
      })
      .catch((e) => {
        if (!cancelado) setError(e.message ?? 'No se pudieron cargar las estadísticas.');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [activo, refrescarEn]);

  return { porTenant, loading, error, refrescar: () => setRefrescarEn((n) => n + 1) };
}
