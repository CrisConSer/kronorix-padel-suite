/**
 * functions/src/index.ts
 * -----------------------------------------------------------------------
 * Punto de entrada único de Cloud Functions. Firebase despliega TODO lo
 * que se exporte desde aquí (directa o indirectamente) — cada función
 * vive en su propio archivo por claridad, y aquí solo se reexportan.
 * -----------------------------------------------------------------------
 */

export { crearProfesor } from './crearProfesor';
export { recordatorioClases } from './recordatorioClases';
export { invitarAlumno } from './invitarAlumno';
export { getEstadisticasProfesores } from './getEstadisticasProfesores';

