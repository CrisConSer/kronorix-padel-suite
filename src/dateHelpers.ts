/**
 * dateHelpers.ts
 * -----------------------------------------------------------------------
 * Utilidades mínimas para construir una grilla de calendario mensual sin
 * añadir una librería de fechas solo para esto. Todas las fechas de
 * negocio se guardan como string "YYYY-MM-DD" (mismo patrón que ya
 * usaba Padel Planner con normalizeYMD), así evitamos líos de zona
 * horaria al comparar fechas.
 * -----------------------------------------------------------------------
 */

export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hoyYmd(): string {
  return ymd(new Date());
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function nombreMes(year: number, month: number): string {
  return `${MESES[month]} ${year}`;
}

export { DIAS_SEMANA };

/**
 * Devuelve la grilla de un mes en celdas de "YYYY-MM-DD" o null para
 * relleno (días de meses adyacentes que completan la semana), siempre
 * empezando la semana en Lunes.
 */
export function gridDelMes(year: number, month: number): (string | null)[] {
  const primerDia = new Date(year, month, 1);
  // getDay(): 0=domingo..6=sábado. Convertimos a índice donde 0=lunes.
  const offsetLunes = (primerDia.getDay() + 6) % 7;
  const diasDelMes = new Date(year, month + 1, 0).getDate();

  const celdas: (string | null)[] = [];
  for (let i = 0; i < offsetLunes; i++) celdas.push(null);
  for (let d = 1; d <= diasDelMes; d++) celdas.push(ymd(new Date(year, month, d)));
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

export function mesAnterior(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

export function mesSiguiente(year: number, month: number): { year: number; month: number } {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

export function diaDelMes(fechaYmd: string): number {
  return parseInt(fechaYmd.split('-')[2], 10);
}

export function formatoFechaLarga(fechaYmd: string): string {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${dias[date.getDay()]} ${d} de ${MESES[m - 1]}`;
}
