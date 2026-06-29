'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { AlumnoDoc, BonoDoc, ClaseDoc, PagoDoc } from '@/src/types';
import {
  ingresosPorMes,
  ingresosDelMesActual,
  ingresoMedioPorAlumno,
  ocupacionPorDiaSemana,
  ocupacionMediaGlobal,
  rankingCancelaciones,
  alumnosActivosVsBajas,
  ratioBonoVsSuelta,
  alumnosEnRiesgo,
  bonosAVigilar,
} from '@/src/dashboardClient';

const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * /[tenantSlug]/dashboard
 * -----------------------------------------------------------------------
 * Todas las métricas se calculan en memoria (dashboardClient.ts) a
 * partir de los mismos datos que ya usan Alumnos, Calendario y Pagos
 * — no añade lecturas nuevas más allá de las 4 colecciones base.
 * -----------------------------------------------------------------------
 */
export default function DashboardPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user, loading: loadingUser } = useSessionUser();
  const tenantId = user?.tenantId;

  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [clases, setClases] = useState<ClaseDoc[]>([]);
  const [pagos, setPagos] = useState<PagoDoc[]>([]);
  const [bonos, setBonos] = useState<BonoDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'alumnos'), (snap) => {
      setAlumnos(snap.docs.map((d) => d.data() as AlumnoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'clases'), (snap) => {
      setClases(snap.docs.map((d) => d.data() as ClaseDoc));
      setLoadingDatos(false);
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'pagos'), (snap) => {
      setPagos(snap.docs.map((d) => d.data() as PagoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'bonos'), (snap) => {
      setBonos(snap.docs.map((d) => d.data() as BonoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  const alumnosPorId = useMemo(() => {
    const map = new Map<string, AlumnoDoc>();
    alumnos.forEach((a) => map.set(a.alumnoId, a));
    return map;
  }, [alumnos]);

  const ingresosMes = useMemo(() => ingresosDelMesActual(pagos), [pagos]);
  const ingresosSerie = useMemo(() => ingresosPorMes(pagos, 6), [pagos]);
  const { activos, bajas } = useMemo(() => alumnosActivosVsBajas(alumnos), [alumnos]);
  const ingresoMedio = useMemo(() => ingresoMedioPorAlumno(pagos, activos), [pagos, activos]);
  const ocupacionDias = useMemo(() => ocupacionPorDiaSemana(clases), [clases]);
  const ocupacionGlobal = useMemo(() => ocupacionMediaGlobal(clases), [clases]);
  const ranking = useMemo(() => rankingCancelaciones(clases, alumnosPorId), [clases, alumnosPorId]);
  const ratioModalidad = useMemo(() => ratioBonoVsSuelta(alumnos), [alumnos]);
  const enRiesgo = useMemo(() => alumnosEnRiesgo(alumnos, clases), [alumnos, clases]);
  const bonosVigilar = useMemo(() => bonosAVigilar(alumnos, bonos), [alumnos, bonos]);

  if (loadingUser) return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  if (!user || user.role !== 'admin' || user.tenantSlug !== params.tenantSlug) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }
  if (loadingDatos) return <div className="p-6 text-sm text-zinc-500">Cargando datos…</div>;

  const maxOcupacion = Math.max(...ocupacionDias.map((d) => d.ocupacionMedia), 0.01);
  const maxIngresoSerie = Math.max(...ingresosSerie.map((m) => m.total), 1);

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Cuadro de mando</h1>
        <p className="text-sm text-zinc-600 mt-1">Ocupación, ingresos y alumnos.</p>
      </header>

      {/* Tarjetas resumen */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaMetrica titulo="Ingresos este mes" valor={`${ingresosMes.toFixed(2)} €`} />
        <TarjetaMetrica titulo="Ingreso medio / alumno" valor={`${ingresoMedio.toFixed(2)} €`} />
        <TarjetaMetrica titulo="Ocupación media" valor={`${(ocupacionGlobal * 100).toFixed(0)}%`} />
        <TarjetaMetrica titulo="Alumnos activos" valor={`${activos}`} sub={`${bajas} de baja`} />
      </section>

      {/* Ocupación por día de la semana */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Ocupación por día de la semana</h2>
        <div className="border border-zinc-200 rounded bg-white p-4">
          <div className="flex items-end gap-1.5 sm:gap-3 h-28 sm:h-32">
            {ocupacionDias.map((d) => (
              <div key={d.diaSemana} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center h-full">
                  <div
                    className="w-full max-w-8 rounded-t bg-amber-400"
                    style={{ height: `${(d.ocupacionMedia / maxOcupacion) * 100}%` }}
                    title={`${(d.ocupacionMedia * 100).toFixed(0)}% (${d.totalClases} clases)`}
                  />
                </div>
                <span className="text-xs text-zinc-500">{NOMBRES_DIAS[d.diaSemana]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ingresos por mes */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Ingresos (últimos 6 meses)</h2>
        <div className="border border-zinc-200 rounded bg-white p-4">
          <div className="flex items-end gap-1.5 sm:gap-3 h-28 sm:h-32">
            {ingresosSerie.map((m) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center h-full">
                  <div
                    className="w-full max-w-10 rounded-t bg-emerald-400"
                    style={{ height: `${(m.total / maxIngresoSerie) * 100}%` }}
                    title={`${m.total.toFixed(2)} €`}
                  />
                </div>
                <span className="text-xs text-zinc-500">{m.mes.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Ratio bono vs suelta */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Bono vs clase suelta</h2>
          <div className="border border-zinc-200 rounded bg-white p-4 flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-amber-600">{ratioModalidad.bono}</div>
              <div className="text-xs text-zinc-500">con bono</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-700">{ratioModalidad.suelta}</div>
              <div className="text-xs text-zinc-500">clase suelta</div>
            </div>
          </div>
        </section>

        {/* Bonos a vigilar */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Bonos a vigilar</h2>
          <div className="border border-zinc-200 rounded bg-white p-4">
            {bonosVigilar.length === 0 ? (
              <p className="text-sm text-zinc-500">Ningún bono agotado o caducado ahora mismo.</p>
            ) : (
              <ul className="space-y-2">
                {bonosVigilar.map((b) => (
                  <li key={b.alumnoId} className="flex items-center justify-between text-sm">
                    <span>{b.nombre}</span>
                    <span
                      className={[
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        b.estado === 'agotado' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700',
                      ].join(' ')}
                    >
                      {b.estado === 'agotado' ? 'Agotado' : 'Caducado'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Alumnos en riesgo de abandono */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Alumnos en riesgo de abandono</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Activos que venían asistiendo y no han venido a ninguna clase en los últimos 30 días.
        </p>
        <div className="border border-zinc-200 rounded bg-white">
          {enRiesgo.length === 0 ? (
            <p className="text-sm text-zinc-500 p-4">Ningún alumno en esta situación ahora mismo.</p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {enRiesgo.map((a) => (
                <li key={a.alumnoId} className="p-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-900">{a.nombre}</span>
                  <span className="text-xs text-zinc-500">
                    {a.clasesMesAnterior} clases el mes anterior · 0 en los últimos 30 días
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Ranking de cancelaciones */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Ranking de cancelaciones</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Alumnos que más han cancelado avisando con antelación (no incluye bajas sin avisar).
        </p>
        <div className="border border-zinc-200 rounded bg-white">
          {ranking.length === 0 ? (
            <p className="text-sm text-zinc-500 p-4">Sin cancelaciones registradas todavía.</p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {ranking.slice(0, 10).map((r, i) => (
                <li key={r.alumnoId} className="p-3 flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {r.nombre}
                  </span>
                  <span className="text-xs text-zinc-500">{r.cancelaciones} cancelaciones</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TarjetaMetrica({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="border border-zinc-200 rounded bg-white p-4">
      <div className="text-xs text-zinc-500">{titulo}</div>
      <div className="text-2xl font-bold text-zinc-900 mt-1">{valor}</div>
      {sub && <div className="text-xs text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}
