'use client';

/**
 * Tipo duplicado a propósito respecto al de la Cloud Function.
 * El frontend (Next.js/App Hosting) y las Functions son dos paquetes de
 * build distintos con dependencias distintas (esta carpeta no tiene
 * firebase-admin instalado). Importar tipos de uno a otro rompe el build
 * de Next porque intenta compilar también el archivo de la función.
 * Si cambias la forma de los datos en getEstadisticasProfesores.ts,
 * actualiza también este tipo a mano.
 */
export type EstadisticasTenant = {
  tenantId: string;
  totalAlumnos: number;
  totalClases: number;
  ultimaActividad: string | null;
  estado: 'activo' | 'atencion' | 'inactivo' | 'sin-datos';
};

/**
 * src/ProfesorStatsCard.tsx
 * -----------------------------------------------------------------------
 * Fila de estadísticas a insertar dentro de cada tarjeta de profesor en
 * ProfesoresPage.tsx. Solo números agregados — nunca nombres de alumnos.
 *
 * Uso dentro de ProfesoresPage.tsx, dentro del .map(tenants):
 *
 *   <ProfesorStatsCard stats={estadisticasPorTenant[tenant.tenantId]} />
 * -----------------------------------------------------------------------
 */

const ESTADO_CONFIG: Record<
  EstadisticasTenant['estado'],
  { label: string; color: string; bg: string }
> = {
  activo: { label: 'Activo', color: '#1FA97A', bg: '#1FA97A15' },
  atencion: { label: 'Atención', color: '#E8A020', bg: '#E8A02015' },
  inactivo: { label: 'Inactivo', color: '#C04810', bg: '#C0481015' },
  'sin-datos': { label: 'Sin actividad aún', color: '#35354280', bg: '#35354210' },
};

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const dias = Math.round((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24));
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function ProfesorStatsCard({
  stats,
  loading,
}: {
  stats: EstadisticasTenant | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: '#35354220' }}>
        <span className="text-xs" style={{ color: '#35354280' }}>Calculando estadísticas…</span>
      </div>
    );
  }

  if (!stats) return null;

  const estado = ESTADO_CONFIG[stats.estado];

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 pt-3 border-t"
      style={{ borderColor: '#35354220' }}
    >
      <div>
        <span className="text-lg font-black" style={{ color: '#09090F' }}>
          {stats.totalAlumnos}
        </span>
        <span className="text-xs ml-1" style={{ color: '#35354299' }}>
          alumno{stats.totalAlumnos === 1 ? '' : 's'}
        </span>
      </div>

      <div>
        <span className="text-lg font-black" style={{ color: '#09090F' }}>
          {stats.totalClases}
        </span>
        <span className="text-xs ml-1" style={{ color: '#35354299' }}>
          clase{stats.totalClases === 1 ? '' : 's'}
        </span>
      </div>

      <div className="text-xs" style={{ color: '#35354299' }}>
        Última actividad: <span className="font-medium">{formatearFecha(stats.ultimaActividad)}</span>
      </div>

      <span
        className="ml-auto text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full flex items-center gap-1.5"
        style={{ color: estado.color, background: estado.bg }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: estado.color }}
        />
        {estado.label}
      </span>
    </div>
  );
}
