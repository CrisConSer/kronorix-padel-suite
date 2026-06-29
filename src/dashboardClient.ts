import type { AlumnoDoc, BonoDoc, ClaseDoc, PagoDoc, TagDoc } from './types';
import { hoyYmd } from './dateHelpers';

/**
 * dashboardClient.ts
 * -----------------------------------------------------------------------
 * Todas las funciones de aquí son cálculos PUROS en memoria sobre datos
 * que la página ya tiene cargados (clases, alumnos, pagos, bonos) — no
 * hacen ninguna lectura nueva de Firestore. Esto evita índices/queries
 * adicionales: el volumen de datos de un solo profesor es pequeño y
 * cabe perfectamente en memoria para esta primera versión.
 * -----------------------------------------------------------------------
 */

// ===================== Ingresos =====================

export type IngresoMensual = { mes: string; total: number };

/**
 * Agrupa los pagos por mes (YYYY-MM) y suma el importe. Devuelve los
 * últimos `meses` ordenados cronológicamente (más antiguo primero), así
 * que un gráfico de barras simple los puede pintar en orden natural.
 */
export function ingresosPorMes(pagos: PagoDoc[], meses = 6): IngresoMensual[] {
  const porMes = new Map<string, number>();
  pagos.forEach((p) => {
    if (!p.fecha) return;
    const d = p.fecha.toDate();
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    porMes.set(clave, (porMes.get(clave) || 0) + p.importe);
  });

  const ahora = new Date();
  const resultado: IngresoMensual[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    resultado.push({ mes: clave, total: porMes.get(clave) || 0 });
  }
  return resultado;
}

export function ingresosDelMesActual(pagos: PagoDoc[]): number {
  const ahora = new Date();
  return pagos.reduce((sum, p) => {
    if (!p.fecha) return sum;
    const d = p.fecha.toDate();
    if (d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth()) {
      return sum + p.importe;
    }
    return sum;
  }, 0);
}

export function ingresoMedioPorAlumno(pagos: PagoDoc[], alumnosActivos: number): number {
  if (alumnosActivos === 0) return 0;
  const total = ingresosDelMesActual(pagos);
  return total / alumnosActivos;
}

// ===================== Ocupación =====================

export type OcupacionPorDia = { diaSemana: number; ocupacionMedia: number; totalClases: number };

/**
 * Ocupación media por día de la semana (0=domingo..6=sábado), sobre
 * clases programadas o completadas (no canceladas). Sirve para ver
 * qué días están más completos.
 */
export function ocupacionPorDiaSemana(clases: ClaseDoc[]): OcupacionPorDia[] {
  const acumulado = new Map<number, { ocupacion: number; count: number }>();
  for (let i = 0; i < 7; i++) acumulado.set(i, { ocupacion: 0, count: 0 });

  clases
    .filter((c) => !c.estado.startsWith('cancelada'))
    .forEach((c) => {
      const [y, m, d] = c.fecha.split('-').map(Number);
      const diaSemana = new Date(y, m - 1, d).getDay();
      const entry = acumulado.get(diaSemana)!;
      entry.ocupacion += c.capacidad > 0 ? c.alumnosIds.length / c.capacidad : 0;
      entry.count += 1;
    });

  return Array.from(acumulado.entries()).map(([diaSemana, { ocupacion, count }]) => ({
    diaSemana,
    ocupacionMedia: count > 0 ? ocupacion / count : 0,
    totalClases: count,
  }));
}

export function ocupacionMediaGlobal(clases: ClaseDoc[]): number {
  const activas = clases.filter((c) => !c.estado.startsWith('cancelada') && c.capacidad > 0);
  if (activas.length === 0) return 0;
  const suma = activas.reduce((acc, c) => acc + c.alumnosIds.length / c.capacidad, 0);
  return suma / activas.length;
}

// ===================== Cancelaciones =====================

export type RankingCancelacion = { alumnoId: string; nombre: string; cancelaciones: number };

/**
 * Ranking de alumnos que más cancelan (avisando, ver alumnosCancelaron
 * en ClaseDoc), de mayor a menor. Solo cuenta cancelaciones reales —
 * "quitar sin más" (ej. error del profesor al asignar) no se incluye
 * porque no se registra en alumnosCancelaron.
 */
export function rankingCancelaciones(
  clases: ClaseDoc[],
  alumnosPorId: Map<string, AlumnoDoc>
): RankingCancelacion[] {
  const conteo = new Map<string, number>();
  clases.forEach((c) => {
    (c.alumnosCancelaron || []).forEach((id) => {
      conteo.set(id, (conteo.get(id) || 0) + 1);
    });
  });

  return Array.from(conteo.entries())
    .map(([alumnoId, cancelaciones]) => ({
      alumnoId,
      nombre: alumnosPorId.get(alumnoId)?.nombre || 'Alumno',
      cancelaciones,
    }))
    .sort((a, b) => b.cancelaciones - a.cancelaciones);
}

// ===================== Alumnos: altas, bajas, riesgo =====================

export function alumnosActivosVsBajas(alumnos: AlumnoDoc[]): { activos: number; bajas: number } {
  return {
    activos: alumnos.filter((a) => a.estado === 'activo').length,
    bajas: alumnos.filter((a) => a.estado === 'baja').length,
  };
}

export function ratioBonoVsSuelta(alumnos: AlumnoDoc[]): { bono: number; suelta: number } {
  const activos = alumnos.filter((a) => a.estado === 'activo');
  return {
    bono: activos.filter((a) => a.modalidad === 'bono').length,
    suelta: activos.filter((a) => a.modalidad === 'suelta').length,
  };
}

export type AlumnoEnRiesgo = {
  alumnoId: string;
  nombre: string;
  clasesUltimoMes: number;
  clasesMesAnterior: number;
};

/**
 * Alumnos "en riesgo de abandono": activos, que asistieron a 0 clases
 * en los últimos 30 días pero sí asistieron a alguna en los 30 días
 * anteriores a esos (es decir, venían viniendo y han dejado de venir
 * de golpe). Es una heurística simple a propósito — no pretende ser un
 * modelo predictivo, solo una señal visible para que el profesor lo
 * revise.
 */
export function alumnosEnRiesgo(
  alumnos: AlumnoDoc[],
  clases: ClaseDoc[]
): AlumnoEnRiesgo[] {
  const ahora = new Date();
  const hace30 = new Date(ahora);
  hace30.setDate(hace30.getDate() - 30);
  const hace60 = new Date(ahora);
  hace60.setDate(hace60.getDate() - 60);

  const activos = alumnos.filter((a) => a.estado === 'activo');
  const resultado: AlumnoEnRiesgo[] = [];

  activos.forEach((alumno) => {
    let clasesUltimoMes = 0;
    let clasesMesAnterior = 0;

    clases.forEach((c) => {
      if (!c.alumnosAsistieron.includes(alumno.alumnoId)) return;
      const [y, m, d] = c.fecha.split('-').map(Number);
      const fechaClase = new Date(y, m - 1, d);
      if (fechaClase >= hace30 && fechaClase <= ahora) {
        clasesUltimoMes += 1;
      } else if (fechaClase >= hace60 && fechaClase < hace30) {
        clasesMesAnterior += 1;
      }
    });

    if (clasesUltimoMes === 0 && clasesMesAnterior > 0) {
      resultado.push({
        alumnoId: alumno.alumnoId,
        nombre: alumno.nombre,
        clasesUltimoMes,
        clasesMesAnterior,
      });
    }
  });

  return resultado.sort((a, b) => b.clasesMesAnterior - a.clasesMesAnterior);
}

// ===================== Bonos a vigilar =====================

export type BonoAVigilar = {
  alumnoId: string;
  nombre: string;
  estado: 'agotado' | 'caducado';
  restantes: number;
};

/**
 * Bonos agotados o caducados de alumnos activos — para que el profesor
 * sepa a quién recordarle que renueve. No bloquea nada (decisión ya
 * tomada), solo es la lista de aviso.
 */
export function bonosAVigilar(
  alumnos: AlumnoDoc[],
  bonos: BonoDoc[]
): BonoAVigilar[] {
  const bonosPorAlumno = new Map<string, BonoDoc>();
  bonos.forEach((b) => {
    const actual = bonosPorAlumno.get(b.alumnoId);
    if (!actual || b.createdAt.toMillis() > actual.createdAt.toMillis()) {
      bonosPorAlumno.set(b.alumnoId, b);
    }
  });

  const resultado: BonoAVigilar[] = [];
  const hoy = Date.now();

  alumnos
    .filter((a) => a.estado === 'activo' && a.modalidad === 'bono')
    .forEach((alumno) => {
      const bono = bonosPorAlumno.get(alumno.alumnoId);
      if (!bono) return;
      const restantes = Math.max(0, bono.clasesContratadas - bono.clasesConsumidas);
      const agotado = restantes === 0;
      const caducado = !agotado && bono.fechaFin.toMillis() < hoy;
      if (agotado || caducado) {
        resultado.push({
          alumnoId: alumno.alumnoId,
          nombre: alumno.nombre,
          estado: agotado ? 'agotado' : 'caducado',
          restantes,
        });
      }
    });

  return resultado;
}
