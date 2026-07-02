'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTenantGuard } from '@/src/useTenantGuard';
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
  const { loading: loadingUser, allowed, user } = useTenantGuard(params.tenantSlug);

  // Para super_admin, resolver tenantId desde el slug de la URL.
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { setTenantId(user.tenantId); return; }
    getDocs(query(collection(db, 'tenants'), where('slug', '==', params.tenantSlug)))
      .then((snap) => { if (!snap.empty) setTenantId(snap.docs[0].data().tenantId as string); });
  }, [user?.role, user?.tenantId, params.tenantSlug]);


  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [clases, setClases] = useState<ClaseDoc[]>([]);
  const [pagos, setPagos] = useState<PagoDoc[]>([]);
  const [bonos, setBonos] = useState<BonoDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  useEffect(() => {
    if (!tenantId || (user?.role !== 'admin' && user?.role !== 'super_admin')) return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'alumnos'), (snap) => {
      setAlumnos(snap.docs.map((d) => d.data() as AlumnoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || (user?.role !== 'admin' && user?.role !== 'super_admin')) return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'clases'), (snap) => {
      setClases(snap.docs.map((d) => d.data() as ClaseDoc));
      setLoadingDatos(false);
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || (user?.role !== 'admin' && user?.role !== 'super_admin')) return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'pagos'), (snap) => {
      setPagos(snap.docs.map((d) => d.data() as PagoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || (user?.role !== 'admin' && user?.role !== 'super_admin')) return;
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
  if (!allowed || !user) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }
  if (loadingDatos) return <div className="p-6 text-sm text-zinc-500">Cargando datos…</div>;

  const maxOcupacion = Math.max(...ocupacionDias.map((d) => d.ocupacionMedia), 0.01);
  const maxIngresoSerie = Math.max(...ingresosSerie.map((m) => m.total), 1);

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>Cuadro de mando</h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>Ocupación, ingresos y alumnos.</p>
      </header>

      {/* ── TARJETAS RESUMEN ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaMetrica
          titulo="Ingresos este mes"
          valor={`${ingresosMes.toFixed(2)} €`}
          icono="💶"
          acento="#E8A020"
        />
        <TarjetaMetrica
          titulo="Ingreso medio / alumno"
          valor={`${ingresoMedio.toFixed(2)} €`}
          icono="📊"
          acento="#E8A020"
        />
        <TarjetaMetrica
          titulo="Ocupación media"
          valor={`${(ocupacionGlobal * 100).toFixed(0)}%`}
          icono="🎯"
          acento={ocupacionGlobal >= 0.8 ? '#16a34a' : ocupacionGlobal >= 0.5 ? '#E8A020' : '#C04810'}
        />
        <TarjetaMetrica
          titulo="Alumnos activos"
          valor={`${activos}`}
          sub={`${bajas} de baja`}
          icono="👥"
          acento="#09090F"
        />
      </section>

      {/* ── GRÁFICAS ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Ocupación por día */}
        <section
          className="rounded-2xl p-5"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#353542' }}>
            Ocupación por día
          </h2>
          <div className="flex items-end gap-1.5 h-28">
            {ocupacionDias.map((d) => {
              const pct = maxOcupacion > 0 ? (d.ocupacionMedia / maxOcupacion) * 100 : 0;
              const esMax = d.ocupacionMedia === maxOcupacion && maxOcupacion > 0;
              return (
                <div key={d.diaSemana} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.max(pct, 4)}%`,
                        background: esMax ? '#E8A020' : '#09090F',
                        opacity: pct < 5 ? 0.15 : 1,
                      }}
                      title={`${(d.ocupacionMedia * 100).toFixed(0)}% · ${d.totalClases} clases`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: esMax ? '#E8A020' : '#a1a1aa' }}>
                    {NOMBRES_DIAS[d.diaSemana]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Ingresos por mes */}
        <section
          className="rounded-2xl p-5"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#353542' }}>
            Ingresos · últimos 6 meses
          </h2>
          <div className="flex items-end gap-1.5 h-28">
            {ingresosSerie.map((m, i) => {
              const pct = maxIngresoSerie > 0 ? (m.total / maxIngresoSerie) * 100 : 0;
              const esUltimo = i === ingresosSerie.length - 1;
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(pct, 4)}%`,
                        background: esUltimo ? '#E8A020' : '#09090F',
                        opacity: pct < 5 ? 0.15 : esUltimo ? 1 : 0.5,
                      }}
                      title={`${m.total.toFixed(2)} €`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: esUltimo ? '#E8A020' : '#a1a1aa' }}>
                    {m.mes.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── FILA INTERMEDIA ── */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* Bono vs suelta */}
        <section
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: '#09090F', border: '1.5px solid #09090F' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#E8A02080' }}>
            Modalidad
          </h2>
          <div className="flex items-end gap-4">
            <div>
              <div className="text-3xl font-black" style={{ color: '#E8A020' }}>{ratioModalidad.bono}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#F4EFE680' }}>Bono</div>
            </div>
            <div className="w-px self-stretch" style={{ background: '#ffffff15' }} />
            <div>
              <div className="text-3xl font-black text-white">{ratioModalidad.suelta}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#F4EFE680' }}>Suelta</div>
            </div>
          </div>
          {(ratioModalidad.bono + ratioModalidad.suelta) > 0 && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#ffffff15' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(ratioModalidad.bono / (ratioModalidad.bono + ratioModalidad.suelta)) * 100}%`,
                  background: '#E8A020',
                }}
              />
            </div>
          )}
        </section>

        {/* Bonos a vigilar */}
        <section
          className="rounded-2xl p-5 sm:col-span-2"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
              Bonos a vigilar
            </h2>
            {bonosVigilar.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#C0481015', color: '#C04810' }}>
                {bonosVigilar.length}
              </span>
            )}
          </div>
          {bonosVigilar.length === 0 ? (
            <p className="text-sm" style={{ color: '#a1a1aa' }}>Todo en orden — ningún bono agotado ni caducado.</p>
          ) : (
            <ul className="space-y-2">
              {bonosVigilar.map((b) => (
                <li key={b.alumnoId} className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: '#09090F' }}>{b.nombre}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                    style={
                      b.estado === 'agotado'
                        ? { background: '#E8A02018', color: '#92400e' }
                        : { background: '#C0481015', color: '#C04810' }
                    }
                  >
                    {b.estado === 'agotado' ? 'Agotado' : 'Caducado'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── ALERTAS Y RANKING ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Alumnos en riesgo */}
        <section
          className="rounded-2xl overflow-hidden"
          style={{ border: '1.5px solid #e4e4e7' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: '#09090F' }}
          >
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#E8A020' }}>
              En riesgo de abandono
            </h2>
            {enRiesgo.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#C04810', color: 'white' }}>
                {enRiesgo.length}
              </span>
            )}
          </div>
          <div className="bg-white">
            {enRiesgo.length === 0 ? (
              <p className="text-sm p-4" style={{ color: '#a1a1aa' }}>Ningún alumno en esta situación.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {enRiesgo.map((a) => (
                  <li key={a.alumnoId} className="px-4 py-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: '#09090F' }}>{a.nombre}</span>
                    <span className="text-[11px] shrink-0" style={{ color: '#a1a1aa' }}>
                      {a.clasesMesAnterior} cl. antes · 0 ahora
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Ranking cancelaciones */}
        <section
          className="rounded-2xl overflow-hidden"
          style={{ border: '1.5px solid #e4e4e7' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: '#09090F' }}
          >
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#E8A020' }}>
              Más cancelaciones
            </h2>
          </div>
          <div className="bg-white">
            {ranking.length === 0 ? (
              <p className="text-sm p-4" style={{ color: '#a1a1aa' }}>Sin cancelaciones registradas.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {ranking.slice(0, 5).map((r, i) => (
                  <li key={r.alumnoId} className="px-4 py-3 flex items-center gap-3">
                    <span
                      className="text-[11px] font-black w-5 text-center shrink-0"
                      style={{ color: i === 0 ? '#E8A020' : '#a1a1aa' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium flex-1 truncate" style={{ color: '#09090F' }}>{r.nombre}</span>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: '#09090F', color: '#E8A020' }}
                    >
                      {r.cancelaciones}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TarjetaMetrica({
  titulo,
  valor,
  sub,
  icono,
  acento,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  icono?: string;
  acento?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#a1a1aa' }}>
          {titulo}
        </span>
        {icono && <span className="text-base">{icono}</span>}
      </div>
      <div className="text-2xl font-black leading-none" style={{ color: acento || '#09090F' }}>
        {valor}
      </div>
      {sub && <div className="text-[11px]" style={{ color: '#a1a1aa' }}>{sub}</div>}
    </div>
  );
}
