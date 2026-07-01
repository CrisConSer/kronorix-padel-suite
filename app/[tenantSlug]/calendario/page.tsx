'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { AlumnoDoc, ClaseDoc, TagDoc, TipoClase } from '@/src/types';
import {
  crearClase,
  actualizarClase,
  alumnosCompatiblesConHueco,
  apuntarseAClase,
  darBajaDeClase,
  cancelarClase,
} from '@/src/calendarioClient';
import { marcarAsistencia, desmarcarAsistencia } from '@/src/pagosClient';
import {
  ymd,
  hoyYmd,
  nombreMes,
  gridDelMes,
  mesAnterior,
  mesSiguiente,
  diaDelMes,
  formatoFechaLarga,
  DIAS_SEMANA,
} from '@/src/dateHelpers';

/**
 * /[tenantSlug]/calendario
 * -----------------------------------------------------------------------
 * Vista mensual. Cada día muestra sus clases como tarjetas pequeñas.
 * Click en un día vacío -> crear clase ese día. Click en una clase ->
 * panel de detalle (alumnos, hueco libre con compatibles, lista de
 * espera, cancelar).
 * -----------------------------------------------------------------------
 */
export default function CalendarioPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user, loading: loadingUser } = useSessionUser();
  const tenantId = user?.tenantId;

  const hoy = useMemo(() => new Date(), []);
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth());

  const [clases, setClases] = useState<ClaseDoc[]>([]);
  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [tags, setTags] = useState<TagDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  const [fechaParaCrear, setFechaParaCrear] = useState<string | null>(null);
  const [claseSeleccionada, setClaseSeleccionada] = useState<ClaseDoc | null>(null);
  // Vista en móvil: 'agenda' (lista por día) o 'mes' (cuadrícula compacta)
  const [vistaMovil, setVistaMovil] = useState<'agenda' | 'mes'>('agenda');

  // Clases del tenant (todas; filtramos por mes en memoria, el volumen
  // de un solo profesor es pequeño y así evitamos índices adicionales
  // por rango de fecha en esta primera versión).
  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(collection(db, 'tenants', tenantId, 'clases'), orderBy('fecha'));
    const unsub = onSnapshot(q, (snap) => {
      setClases(snap.docs.map((d) => d.data() as ClaseDoc));
      setLoadingDatos(false);
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(collection(db, 'tenants', tenantId, 'alumnos'), orderBy('nombre'));
    const unsub = onSnapshot(q, (snap) => {
      setAlumnos(snap.docs.map((d) => d.data() as AlumnoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(collection(db, 'tenants', tenantId, 'tags'), orderBy('nombre'));
    const unsub = onSnapshot(q, (snap) => {
      setTags(snap.docs.map((d) => d.data() as TagDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  const alumnosPorId = useMemo(() => {
    const map = new Map<string, AlumnoDoc>();
    alumnos.forEach((a) => map.set(a.alumnoId, a));
    return map;
  }, [alumnos]);

  const tagsPorId = useMemo(() => {
    const map = new Map<string, TagDoc>();
    tags.forEach((t) => map.set(t.tagId, t));
    return map;
  }, [tags]);

  const clasesPorDia = useMemo(() => {
    const map = new Map<string, ClaseDoc[]>();
    clases.forEach((c) => {
      const lista = map.get(c.fecha) || [];
      lista.push(c);
      map.set(c.fecha, lista);
    });
    map.forEach((lista) => lista.sort((a, b) => a.hora.localeCompare(b.hora)));
    return map;
  }, [clases]);

  const celdas = useMemo(() => gridDelMes(year, month), [year, month]);
  const hoyStr = hoyYmd();

  if (loadingUser) return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  if (!user || user.role !== 'admin' || user.tenantSlug !== params.tenantSlug) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold text-zinc-900 tracking-tight">Calendario</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Clases, cupos y lista de espera.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vista mes/agenda — solo visible en móvil */}
          <div
            className="sm:hidden flex rounded-xl p-1 gap-1"
            style={{ background: '#09090F' }}
          >
            <button
              onClick={() => setVistaMovil('agenda')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: vistaMovil === 'agenda' ? '#E8A020' : 'transparent',
                color: vistaMovil === 'agenda' ? '#09090F' : '#F4EFE660',
              }}
            >
              Agenda
            </button>
            <button
              onClick={() => setVistaMovil('mes')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: vistaMovil === 'mes' ? '#E8A020' : 'transparent',
                color: vistaMovil === 'mes' ? '#09090F' : '#F4EFE660',
              }}
            >
              Mes
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-1 bg-white border border-zinc-200/80 rounded-lg p-1 shadow-sm shadow-zinc-200/50">
            <button
              onClick={() => {
                const r = mesAnterior(year, month);
                setYear(r.year);
                setMonth(r.month);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              aria-label="Mes anterior"
            >
              ←
            </button>
            <span className="text-sm font-medium text-zinc-700 w-28 sm:w-36 text-center capitalize">
              {nombreMes(year, month)}
            </span>
            <button
              onClick={() => {
                const r = mesSiguiente(year, month);
                setYear(r.year);
                setMonth(r.month);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </div>
        </div>
      </header>

      {loadingDatos ? (
        <p className="text-sm text-zinc-500">Cargando calendario…</p>
      ) : (
        <>
          {/* Grilla mensual — solo en sm: y superior */}
          <div className="hidden sm:block border border-zinc-200/80 rounded-xl overflow-hidden bg-white shadow-sm shadow-zinc-200/50">
            <div className="grid grid-cols-7 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-500">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="p-2 text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {celdas.map((fecha, i) => (
                <DiaCelda
                  key={i}
                  fecha={fecha}
                  esHoy={fecha === hoyStr}
                  clases={fecha ? clasesPorDia.get(fecha) || [] : []}
                  tagsPorId={tagsPorId}
                  alumnosPorId={alumnosPorId}
                  onCrear={() => fecha && setFechaParaCrear(fecha)}
                  onClickClase={(c) => setClaseSeleccionada(c)}
                />
              ))}
            </div>
          </div>

          {/* Vista móvil: agenda o cuadrícula de mes */}
          {vistaMovil === 'agenda' ? (
            <AgendaMovil
              celdas={celdas}
              clasesPorDia={clasesPorDia}
              hoyStr={hoyStr}
              tagsPorId={tagsPorId}
              alumnosPorId={alumnosPorId}
              onCrear={(fecha) => setFechaParaCrear(fecha)}
              onClickClase={(c) => setClaseSeleccionada(c)}
            />
          ) : (
            <MesMovil
              celdas={celdas}
              clasesPorDia={clasesPorDia}
              hoyStr={hoyStr}
              tagsPorId={tagsPorId}
              onCrear={(fecha) => setFechaParaCrear(fecha)}
              onClickClase={(c) => setClaseSeleccionada(c)}
            />
          )}
        </>
      )}

      {fechaParaCrear && (
        <CrearClaseModal
          tenantId={tenantId!}
          fecha={fechaParaCrear}
          alumnos={alumnos}
          tags={tags}
          createdBy={user.uid}
          onClose={() => setFechaParaCrear(null)}
        />
      )}

      {claseSeleccionada && (
        <DetalleClaseModal
          tenantId={tenantId!}
          clase={claseSeleccionada}
          alumnosPorId={alumnosPorId}
          catalogoAlumnos={alumnos}
          tagsPorId={tagsPorId}
          tags={tags}
          createdBy={user.uid}
          onClose={() => setClaseSeleccionada(null)}
        />
      )}
    </div>
  );
}

/**
 * Vista de mes compacta para móvil: cuadrícula 7 columnas con puntos
 * de color donde hay clases. Al pulsar un día con clases se abre
 * directamente el detalle de la primera clase (o el modal de crear si
 * el día está vacío).
 */
function MesMovil({
  celdas,
  clasesPorDia,
  hoyStr,
  tagsPorId,
  onCrear,
  onClickClase,
}: {
  celdas: (string | null)[];
  clasesPorDia: Map<string, ClaseDoc[]>;
  hoyStr: string;
  tagsPorId: Map<string, TagDoc>;
  onCrear: (fecha: string) => void;
  onClickClase: (clase: ClaseDoc) => void;
}) {
  return (
    <div className="sm:hidden">
      {/* Botón crear */}
      <label
        className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer mb-3 transition-colors"
        style={{ border: '1.5px dashed #E8A02080', background: '#F4EFE6' }}
      >
        <span
          className="w-7 h-7 flex items-center justify-center rounded-full text-base font-bold shrink-0"
          style={{ background: '#E8A020', color: '#09090F' }}
        >
          +
        </span>
        <span className="text-sm font-medium" style={{ color: '#353542' }}>Crear clase</span>
        <input
          type="date"
          className="ml-auto bg-transparent text-sm outline-none"
          style={{ color: '#09090F' }}
          defaultValue={hoyStr}
          onChange={(e) => e.target.value && onCrear(e.target.value)}
        />
      </label>

      {/* Cuadrícula */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1.5px solid #e4e4e7', background: 'white' }}
      >
        {/* Cabecera días semana */}
        <div className="grid grid-cols-7 border-b border-zinc-100">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#a1a1aa' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Celdas */}
        <div className="grid grid-cols-7">
          {celdas.map((fecha, i) => {
            if (!fecha) {
              return (
                <div
                  key={i}
                  className="aspect-square border-b border-r border-zinc-50"
                  style={{ background: '#fafafa' }}
                />
              );
            }

            const clasesDia = clasesPorDia.get(fecha) || [];
            const esHoy = fecha === hoyStr;
            const tieneClases = clasesDia.length > 0;

            // Hasta 3 puntos de color (uno por clase, del color de su tag)
            const puntos = clasesDia.slice(0, 3).map((c) => {
              const tag = (c.tagsCompatibles || [])
                .map((id) => tagsPorId.get(id))
                .find((t): t is TagDoc => !!t);
              return tag?.color || '#E8A020';
            });

            return (
              <button
                key={i}
                onClick={() => {
                  if (tieneClases) onClickClase(clasesDia[0]);
                  else onCrear(fecha);
                }}
                className="aspect-square border-b border-r border-zinc-50 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-zinc-50"
              >
                <span
                  className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all"
                  style={{
                    background: esHoy ? '#09090F' : 'transparent',
                    color: esHoy ? '#E8A020' : tieneClases ? '#09090F' : '#a1a1aa',
                    fontWeight: tieneClases ? 700 : 400,
                  }}
                >
                  {parseInt(fecha.split('-')[2])}
                </span>
                {/* Puntos de clases */}
                {puntos.length > 0 && (
                  <div className="flex gap-0.5 justify-center">
                    {puntos.map((color, pi) => (
                      <span
                        key={pi}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Leyenda del mes */}
      {Array.from(clasesPorDia.values()).flat().length > 0 && (
        <p className="text-center text-[11px] mt-3" style={{ color: '#a1a1aa' }}>
          Pulsa un día para ver o crear clases
        </p>
      )}
    </div>
  );
}

function AgendaMovil({
  celdas,
  clasesPorDia,
  hoyStr,
  tagsPorId,
  alumnosPorId,
  onCrear,
  onClickClase,
}: {
  celdas: (string | null)[];
  clasesPorDia: Map<string, ClaseDoc[]>;
  hoyStr: string;
  tagsPorId: Map<string, TagDoc>;
  alumnosPorId: Map<string, AlumnoDoc>;
  onCrear: (fecha: string) => void;
  onClickClase: (clase: ClaseDoc) => void;
}) {
  const diasDelMes = celdas.filter((f): f is string => !!f);
  const diasRelevantes = diasDelMes.filter(
    (fecha) => fecha === hoyStr || (clasesPorDia.get(fecha) || []).length > 0
  );

  return (
    <div className="sm:hidden space-y-3">
      {/* Botón crear clase */}
      <label
        className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer transition-colors"
        style={{ border: '1.5px dashed #E8A02080', background: '#F4EFE6' }}
      >
        <span
          className="w-7 h-7 flex items-center justify-center rounded-full text-base font-bold shrink-0"
          style={{ background: '#E8A020', color: '#09090F' }}
        >
          +
        </span>
        <span className="text-sm font-medium" style={{ color: '#353542' }}>Crear clase</span>
        <input
          type="date"
          className="ml-auto bg-transparent text-sm outline-none"
          style={{ color: '#09090F' }}
          defaultValue={hoyStr}
          onChange={(e) => e.target.value && onCrear(e.target.value)}
        />
      </label>

      {diasRelevantes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-10 text-center">
          <p className="text-sm text-zinc-400">No hay clases este mes todavía.</p>
        </div>
      )}

      {diasRelevantes.map((fecha) => {
        const clases = clasesPorDia.get(fecha) || [];
        const esHoy = fecha === hoyStr;
        const [y, m, d] = fecha.split('-').map(Number);
        const diaSemana = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short' });
        const mesStr = new Date(y, m - 1, d).toLocaleDateString('es-ES', { month: 'short' });

        return (
          <div
            key={fecha}
            className="rounded-2xl overflow-hidden"
            style={{
              border: esHoy ? '1.5px solid #E8A020' : '1.5px solid #e4e4e7',
              boxShadow: esHoy ? '0 0 0 3px #E8A02015' : 'none',
            }}
          >
            {/* Cabecera del día */}
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{
                background: esHoy ? '#09090F' : '#f9f9f9',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex flex-col items-center leading-none">
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: esHoy ? '#E8A020' : '#a1a1aa' }}
                  >
                    {diaSemana}
                  </span>
                  <span
                    className="text-lg font-black"
                    style={{ color: esHoy ? '#F4EFE6' : '#09090F' }}
                  >
                    {d}
                  </span>
                  <span
                    className="text-[10px] uppercase font-medium"
                    style={{ color: esHoy ? '#F4EFE660' : '#a1a1aa' }}
                  >
                    {mesStr}
                  </span>
                </div>
                {esHoy && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: '#E8A02020', color: '#E8A020' }}
                  >
                    Hoy
                  </span>
                )}
              </div>
              <button
                onClick={() => onCrear(fecha)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors"
                style={{
                  background: esHoy ? '#E8A02020' : '#f4f4f5',
                  color: esHoy ? '#E8A020' : '#71717a',
                }}
                title="Crear clase este día"
              >
                +
              </button>
            </div>

            {/* Lista de clases */}
            {clases.length > 0 && (
              <ul className="bg-white divide-y divide-zinc-100">
                {clases.map((c) => {
                  const cancelada = c.estado.startsWith('cancelada');
                  const tagPrincipal = (c.tagsCompatibles || [])
                    .map((id) => tagsPorId.get(id))
                    .find((t): t is TagDoc => !!t);
                  const colorBase = tagPrincipal?.color || '#9CA3AF';
                  const nombresAsignados = c.alumnosIds
                    .map((id) => alumnosPorId.get(id)?.nombre)
                    .filter((n): n is string => !!n);
                  const titulo =
                    c.titulo ||
                    (nombresAsignados.length === 0
                      ? 'Hueco libre'
                      : nombresAsignados.length <= 2
                      ? nombresAsignados.join(', ')
                      : `${nombresAsignados.slice(0, 2).join(', ')} +${nombresAsignados.length - 2}`);
                  const lleno = c.alumnosIds.length >= c.capacidad;

                  return (
                    <li key={c.claseId}>
                      <button
                        onClick={() => onClickClase(c)}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-zinc-50 transition-colors"
                      >
                        {/* Acento de color del tag */}
                        <span
                          className="w-1 self-stretch rounded-full shrink-0"
                          style={{ background: cancelada ? '#e4e4e7' : colorBase }}
                        />
                        <span
                          className="text-sm font-black shrink-0 w-12"
                          style={{ color: cancelada ? '#a1a1aa' : '#09090F' }}
                        >
                          {c.hora}
                        </span>
                        <span
                          className={[
                            'text-sm flex-1 truncate font-medium',
                            cancelada ? 'text-zinc-400 line-through' : 'text-zinc-700',
                          ].join(' ')}
                        >
                          {titulo}
                        </span>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            background: cancelada
                              ? '#f4f4f5'
                              : lleno
                              ? '#09090F'
                              : `${colorBase}18`,
                            color: cancelada
                              ? '#a1a1aa'
                              : lleno
                              ? '#E8A020'
                              : colorBase,
                          }}
                        >
                          {c.alumnosIds.length}/{c.capacidad}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiaCelda({
  fecha,
  esHoy,
  clases,
  tagsPorId,
  alumnosPorId,
  onCrear,
  onClickClase,
}: {
  fecha: string | null;
  esHoy: boolean;
  clases: ClaseDoc[];
  tagsPorId: Map<string, TagDoc>;
  alumnosPorId: Map<string, AlumnoDoc>;
  onCrear: () => void;
  onClickClase: (c: ClaseDoc) => void;
}) {
  if (!fecha) {
    return <div className="min-h-[60px] sm:min-h-[110px] border-b border-r border-zinc-100 bg-zinc-50/40" />;
  }

  return (
    <div className="min-h-[60px] sm:min-h-[110px] border-b border-r border-zinc-100 p-1 sm:p-1.5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className={[
            'text-[10px] sm:text-xs font-medium w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full',
            esHoy ? 'bg-amber-500 text-zinc-950' : 'text-zinc-500',
          ].join(' ')}
        >
          {diaDelMes(fecha)}
        </span>
        <button
          onClick={onCrear}
          className="text-xs text-zinc-400 hover:text-amber-600 leading-none px-1"
          title="Crear clase este día"
        >
          +
        </button>
      </div>
      <div className="flex flex-col gap-0.5 sm:gap-1 overflow-y-auto">
        {clases.map((c) => (
          <ClaseChip
            key={c.claseId}
            clase={c}
            tagsPorId={tagsPorId}
            alumnosPorId={alumnosPorId}
            onClick={() => onClickClase(c)}
          />
        ))}
      </div>
    </div>
  );
}

function ClaseChip({
  clase,
  tagsPorId,
  alumnosPorId,
  onClick,
}: {
  clase: ClaseDoc;
  tagsPorId: Map<string, TagDoc>;
  alumnosPorId: Map<string, AlumnoDoc>;
  onClick: () => void;
}) {
  const cancelada = clase.estado.startsWith('cancelada');

  // Color del chip: el del primer tag compatible de la clase, si tiene.
  // Si no hay tag (caso raro, clase sin alumnos ni filtro), gris neutro.
  const tagPrincipal = (clase.tagsCompatibles || [])
    .map((id) => tagsPorId.get(id))
    .find((t): t is TagDoc => !!t);

  const colorBase = tagPrincipal?.color || '#9CA3AF';

  // Título: el que puso el profesor, o si no hay, los nombres de los
  // alumnos asignados (máximo 2, +N si hay más).
  const nombresAsignados = clase.alumnosIds
    .map((id) => alumnosPorId.get(id)?.nombre)
    .filter((n): n is string => !!n);
  const tituloAuto =
    nombresAsignados.length === 0
      ? 'Hueco libre'
      : nombresAsignados.length <= 2
      ? nombresAsignados.join(', ')
      : `${nombresAsignados.slice(0, 2).join(', ')} +${nombresAsignados.length - 2}`;
  const titulo = clase.titulo || tituloAuto;

  return (
    <button onClick={onClick} className="w-full" title={`${clase.hora} · ${titulo}`}>
      {/* Móvil: solo un punto de color, para no desbordar la celda */}
      <span
        className="sm:hidden block w-2 h-2 rounded-full mx-auto"
        style={{ backgroundColor: cancelada ? '#D4D4D8' : colorBase }}
      />
      {/* sm y superior: chip completo con hora y título */}
      <span
        className={[
          'hidden sm:block text-left text-[11px] leading-tight px-1.5 py-1 rounded border w-full truncate',
          cancelada ? 'opacity-50 line-through' : '',
        ].join(' ')}
        style={
          cancelada
            ? { backgroundColor: '#F4F4F5', color: '#A1A1AA', borderColor: '#E4E4E7' }
            : { backgroundColor: `${colorBase}1A`, color: colorBase, borderColor: `${colorBase}55` }
        }
      >
        <span className="font-medium truncate block">{clase.hora} · {titulo}</span>
        <span className="opacity-80 block">{clase.alumnosIds.length}/{clase.capacidad}</span>
      </span>
    </button>
  );
}

function CrearClaseModal({
  tenantId,
  fecha,
  alumnos,
  tags,
  createdBy,
  onClose,
}: {
  tenantId: string;
  fecha: string;
  alumnos: AlumnoDoc[];
  tags: TagDoc[];
  createdBy: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 capitalize">
            Nueva clase · {formatoFechaLarga(fecha)}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>
        <ClaseForm
          tenantId={tenantId}
          alumnos={alumnos}
          tags={tags}
          modo="crear"
          fechaFija={fecha}
          createdBy={createdBy}
          onDone={onClose}
        />
      </div>
    </div>
  );
}

/**
 * ClaseForm
 * -----------------------------------------------------------------------
 * Formulario reutilizado para CREAR (dentro de CrearClaseModal) y para
 * EDITAR (dentro de DetalleClaseModal, en modo edición). Misma lógica
 * de filtrado de alumnos por tag en ambos casos.
 * -----------------------------------------------------------------------
 */
function ClaseForm({
  tenantId,
  alumnos,
  tags,
  modo,
  fechaFija,
  claseExistente,
  createdBy,
  onDone,
}: {
  tenantId: string;
  alumnos: AlumnoDoc[];
  tags: TagDoc[];
  modo: 'crear' | 'editar';
  fechaFija?: string;
  claseExistente?: ClaseDoc;
  createdBy: string;
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState(claseExistente?.fecha || fechaFija || '');
  const [hora, setHora] = useState(claseExistente?.hora || '18:00');
  const [duracionMinutos, setDuracionMinutos] = useState(claseExistente?.duracionMinutos || 60);
  const [pista, setPista] = useState(claseExistente?.pista || '');
  const [tipo, setTipo] = useState<TipoClase>(claseExistente?.tipo || 'individual');
  const [capacidad, setCapacidad] = useState(claseExistente?.capacidad || 1);
  // En modo editar, si tagsCompatibles tiene exactamente 1 tag, lo
  // tratamos como "el tag elegido" para precargar el selector. Si tiene
  // 0 o varios (porque se calculó por unión de alumnos), se deja vacío.
  const tagInicial =
    claseExistente?.tagsCompatibles?.length === 1 ? claseExistente.tagsCompatibles[0] : '';
  const [tagFiltroId, setTagFiltroId] = useState<string>(tagInicial);
  const [alumnosIds, setAlumnosIds] = useState<string[]>(claseExistente?.alumnosIds || []);
  const [titulo, setTitulo] = useState(claseExistente?.titulo || '');
  const [notas, setNotas] = useState(claseExistente?.notas || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si hay un tag de nivel elegido, solo se pueden seleccionar alumnos
  // que tengan ESE tag — evita mezclar niveles sin querer en la misma
  // clase, que es justo lo que determina los huecos compatibles. En
  // modo editar, dejamos ver también a los ya asignados aunque ya no
  // encajaran con el filtro (para no "perderlos" de la vista sin querer).
  const alumnosSeleccionables = alumnos.filter((a) => {
    if (a.estado !== 'activo' && !alumnosIds.includes(a.alumnoId)) return false;
    if (!tagFiltroId) return true;
    return (a.tagsIds || []).includes(tagFiltroId) || alumnosIds.includes(a.alumnoId);
  });

  function toggleAlumno(id: string) {
    setAlumnosIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleTagFiltroChange(nuevoTagId: string) {
    setTagFiltroId(nuevoTagId);
    if (nuevoTagId) {
      setAlumnosIds((prev) =>
        prev.filter((id) => {
          const alumno = alumnos.find((a) => a.alumnoId === id);
          return alumno && (alumno.tagsIds || []).includes(nuevoTagId);
        })
      );
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (alumnosIds.length > capacidad) {
        throw new Error('Has asignado más alumnos de los que permite el cupo.');
      }
      if (modo === 'crear') {
        await crearClase(tenantId, {
          fecha,
          hora,
          duracionMinutos,
          pista: pista.trim() || undefined,
          tipo,
          capacidad,
          alumnosIds,
          titulo: titulo.trim() || undefined,
          notas: notas.trim() || undefined,
          createdBy,
          catalogoAlumnos: alumnos,
          tagFiltroId: tagFiltroId || undefined,
        });
      } else if (claseExistente) {
        await actualizarClase(tenantId, claseExistente.claseId, {
          fecha,
          hora,
          duracionMinutos,
          pista: pista.trim() || undefined,
          tipo,
          capacidad,
          alumnosIds,
          titulo: titulo.trim() || undefined,
          notas: notas.trim() || undefined,
          catalogoAlumnos: alumnos,
          tagFiltroId: tagFiltroId || undefined,
        });
      }
      onDone();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {modo === 'editar' && (
          <Field label="Fecha">
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </Field>
        )}
        <Field label="Hora">
          <input
            type="time"
            required
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Duración (minutos)">
          <input
            type="number"
            min={15}
            step={15}
            value={duracionMinutos}
            onChange={(e) => setDuracionMinutos(Number(e.target.value))}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Pista (opcional)">
          <input
            value={pista}
            onChange={(e) => setPista(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Pista 1"
          />
        </Field>
        <Field label="Tipo">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoClase)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="individual">Individual</option>
            <option value="dos">Dos</option>
            <option value="grupo">Grupo</option>
          </select>
        </Field>
        <Field label="Capacidad (cupo total)">
          <input
            type="number"
            min={1}
            value={capacidad}
            onChange={(e) => setCapacidad(Number(e.target.value))}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Nivel / tag de la clase (recomendado)">
          <select
            value={tagFiltroId}
            onChange={(e) => handleTagFiltroChange(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">Sin filtrar (no recomendado)</option>
            {tags.map((t) => (
              <option key={t.tagId} value={t.tagId}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Título (opcional)">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Ej. Clase de competición"
          />
        </Field>
      </div>

      {tagFiltroId && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
          Solo se ofrecerá esta clase, y su hueco libre, a alumnos con el tag
          seleccionado.
        </p>
      )}

      <Field label={`Alumnos asignados (${alumnosIds.length}/${capacidad})`}>
        {alumnosSeleccionables.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {tagFiltroId ? 'No tienes alumnos activos con ese tag.' : 'No tienes alumnos activos todavía.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {alumnosSeleccionables.map((a) => {
              const activo = alumnosIds.includes(a.alumnoId);
              return (
                <button
                  type="button"
                  key={a.alumnoId}
                  onClick={() => toggleAlumno(a.alumnoId)}
                  className={[
                    'text-xs px-2.5 py-1 rounded-full border',
                    activo
                      ? 'bg-amber-500 text-zinc-950 border-amber-500 font-medium'
                      : 'bg-white text-zinc-600 border-zinc-300',
                  ].join(' ')}
                >
                  {a.nombre}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Notas (opcional)">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </Field>

      {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
        >
          {submitting ? 'Guardando…' : modo === 'crear' ? 'Crear clase' : 'Guardar cambios'}
        </button>
        {modo === 'editar' && (
          <button type="button" onClick={onDone} className="text-sm text-zinc-600 hover:text-zinc-900">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function DetalleClaseModal({
  tenantId,
  clase,
  alumnosPorId,
  catalogoAlumnos,
  tagsPorId,
  tags,
  createdBy,
  onClose,
}: {
  tenantId: string;
  clase: ClaseDoc;
  alumnosPorId: Map<string, AlumnoDoc>;
  catalogoAlumnos: AlumnoDoc[];
  tagsPorId: Map<string, TagDoc>;
  tags: TagDoc[];
  createdBy: string;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  // Estado optimista: refleja el tick inmediatamente sin esperar al
  // onSnapshot del calendario (que puede tardar 1-2s tras escribir).
  const [asistieronLocal, setAsistieronLocal] = useState<string[]>(
    clase.alumnosAsistieron
  );

  const asignados = clase.alumnosIds.map((id) => alumnosPorId.get(id)).filter((a): a is AlumnoDoc => !!a);
  const enEspera = clase.listaEsperaIds.map((id) => alumnosPorId.get(id)).filter((a): a is AlumnoDoc => !!a);
  const hayHueco = clase.alumnosIds.length < clase.capacidad;
  const compatibles = hayHueco ? alumnosCompatiblesConHueco(clase, catalogoAlumnos) : [];
  const esFutura = clase.fecha >= hoyYmd();
  const tagsDeLaClase = (clase.tagsCompatibles || [])
    .map((id) => tagsPorId.get(id))
    .filter((t): t is TagDoc => !!t);

  async function handleBaja(alumnoId: string, comoCancelacion = false) {
    setWorking(true);
    setError(null);
    try {
      await darBajaDeClase(tenantId, clase.claseId, alumnoId, catalogoAlumnos, comoCancelacion);
    } catch (e: any) {
      setError(e?.message || 'No se pudo procesar la baja.');
    } finally {
      setWorking(false);
    }
  }

  async function handleToggleAsistencia(alumno: AlumnoDoc) {
    const yaAsistio = asistieronLocal.includes(alumno.alumnoId);
    // Actualización optimista inmediata — el checkbox responde al instante.
    setAsistieronLocal((prev) =>
      yaAsistio ? prev.filter((id) => id !== alumno.alumnoId) : [...prev, alumno.alumnoId]
    );
    setWorking(true);
    setError(null);
    try {
      if (yaAsistio) {
        await desmarcarAsistencia(tenantId, clase.claseId, alumno.alumnoId, alumno);
      } else {
        await marcarAsistencia(tenantId, clase.claseId, alumno.alumnoId, alumno);
      }
    } catch (e: any) {
      // Si falla, revertimos el optimismo.
      setAsistieronLocal((prev) =>
        yaAsistio ? [...prev, alumno.alumnoId] : prev.filter((id) => id !== alumno.alumnoId)
      );
      setError(e?.message || 'No se pudo actualizar la asistencia.');
    } finally {
      setWorking(false);
    }
  }

  async function handleCancelarClase() {
    if (!confirm('¿Cancelar esta clase? Quedará marcada como cancelada por el profesor.')) return;
    setWorking(true);
    try {
      await cancelarClase(tenantId, clase.claseId);
      onClose();
    } catch (e) {
      console.error(e);
      setError('No se pudo cancelar la clase.');
    } finally {
      setWorking(false);
    }
  }

  if (editando) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">Editar clase</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
              ×
            </button>
          </div>
          <ClaseForm
            tenantId={tenantId}
            alumnos={catalogoAlumnos}
            tags={tags}
            modo="editar"
            claseExistente={clase}
            createdBy={createdBy}
            onDone={onClose}
          />
        </div>
      </div>
    );
  }

  // Cupos: cuántos asistieron confirmados vs total asignados
  const totalAsistieron = asistieronLocal.length;
  const totalAsignados = asignados.length;
  const ocupacionPct = clase.capacidad > 0
    ? Math.round((clase.alumnosIds.length / clase.capacidad) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
        style={{
          background: '#F4EFE6',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 40px rgba(9,9,15,0.18)',
        }}
      >
        {/* ── CABECERA OSCURA ── */}
        <div
          className="relative px-5 pt-5 pb-4 shrink-0"
          style={{ background: '#09090F', borderRadius: 'inherit inherit 0 0' }}
        >
          {/* Tags en la parte superior */}
          {tagsDeLaClase.length > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {tagsDeLaClase.map((t) => (
                <span
                  key={t.tagId}
                  className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold tracking-wide uppercase"
                  style={{ backgroundColor: `${t.color}30`, color: t.color, border: `1px solid ${t.color}50` }}
                >
                  {t.nombre}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {clase.titulo && (
                <p className="text-[11px] font-semibold tracking-widest uppercase mb-0.5"
                  style={{ color: '#E8A020' }}>
                  {clase.titulo}
                </p>
              )}
              <h2 className="text-xl font-bold text-white leading-tight capitalize">
                {formatoFechaLarga(clase.fecha)}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: '#E8A02099' }}>
                {clase.hora} · {clase.duracionMinutos} min
                {clase.pista ? ` · ${clase.pista}` : ''}
                {clase.tipo ? ` · ${clase.tipo}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Barra de ocupación */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-medium" style={{ color: '#F4EFE680' }}>
                Ocupación
              </span>
              <span className="text-[11px] font-bold" style={{ color: '#E8A020' }}>
                {clase.alumnosIds.length}/{clase.capacidad} plazas
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(244,239,230,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${ocupacionPct}%`,
                  background: ocupacionPct >= 100 ? '#C04810' : '#E8A020',
                }}
              />
            </div>
          </div>

          {clase.estado !== 'programada' && (
            <div className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#C0481022', color: '#C04810' }}>
              Clase {clase.estado}
            </div>
          )}
        </div>

        {/* ── CUERPO CLARO ── */}
        <div className="px-5 py-4 space-y-5">

          {error && (
            <div className="text-sm rounded-xl px-4 py-3 font-medium" style={{ background: '#C0481015', color: '#C04810' }}>
              {error}
            </div>
          )}

          {/* Asistencia */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
                Asistencia
              </h3>
              {asignados.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#09090F', color: '#E8A020' }}>
                  {totalAsistieron}/{totalAsignados}
                </span>
              )}
            </div>
            {asignados.length === 0 ? (
              <p className="text-sm text-zinc-400 italic">Sin alumnos asignados.</p>
            ) : (
              <ul className="space-y-2">
                {asignados.map((a) => {
                  const asistio = asistieronLocal.includes(a.alumnoId);
                  return (
                    <li
                      key={a.alumnoId}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-all"
                      style={{
                        background: asistio ? '#09090F' : 'white',
                        border: `1.5px solid ${asistio ? '#E8A020' : '#e5e7eb'}`,
                      }}
                    >
                      <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                        {/* Checkbox custom */}
                        <span
                          onClick={() => !working && handleToggleAsistencia(a)}
                          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all cursor-pointer"
                          style={{
                            background: asistio ? '#E8A020' : 'transparent',
                            border: `2px solid ${asistio ? '#E8A020' : '#d1d5db'}`,
                          }}
                        >
                          {asistio && (
                            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                              <path d="M1 4L4 7L10 1" stroke="#09090F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span
                          className="text-sm font-medium truncate"
                          onClick={() => !working && handleToggleAsistencia(a)}
                          style={{ color: asistio ? '#F4EFE6' : '#09090F' }}
                        >
                          {a.nombre}
                        </span>
                        {a.modalidad === 'bono' && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{
                              background: asistio ? '#E8A02022' : '#f4f4f5',
                              color: asistio ? '#E8A020' : '#71717a',
                            }}
                          >
                            bono
                          </span>
                        )}
                      </label>
                      {clase.estado === 'programada' && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {esFutura && (
                            <button
                              disabled={working}
                              onClick={() => handleBaja(a.alumnoId, true)}
                              className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                              style={{ color: '#92400e', background: '#fef3c7' }}
                              title="El alumno avisó que no puede venir"
                            >
                              Canceló
                            </button>
                          )}
                          <button
                            disabled={working}
                            onClick={() => handleBaja(a.alumnoId, false)}
                            className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ color: '#991b1b', background: '#fee2e2' }}
                            title="Quitarlo sin registrar como cancelación"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Huecos compatibles */}
          {clase.estado === 'programada' && hayHueco && (
            <section>
              <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#353542' }}>
                Hueco libre · compatibles
              </h3>
              {compatibles.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">
                  Sin alumnos compatibles con el nivel del grupo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {compatibles.map((a) => (
                    <li
                      key={a.alumnoId}
                      className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2.5 border border-zinc-200"
                    >
                      <span className="text-sm font-medium text-zinc-800 truncate min-w-0">{a.nombre}</span>
                      <AsignarBoton tenantId={tenantId} claseId={clase.claseId} alumno={a} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Lista de espera */}
          {enEspera.length > 0 && (
            <section>
              <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#353542' }}>
                Lista de espera
              </h3>
              <ol className="space-y-1.5">
                {enEspera.map((a, i) => (
                  <li
                    key={a.alumnoId}
                    className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-zinc-200 text-sm"
                  >
                    <span className="text-xs font-bold w-5 text-center shrink-0" style={{ color: '#E8A020' }}>
                      {i + 1}
                    </span>
                    <span className="text-zinc-700 font-medium">{a.nombre}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Notas */}
          {clase.notas && (
            <section>
              <h3 className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#353542' }}>
                Notas
              </h3>
              <p className="text-sm text-zinc-600 bg-white rounded-xl px-3 py-2.5 border border-zinc-200 leading-relaxed">
                {clase.notas}
              </p>
            </section>
          )}

          {/* Acciones */}
          {clase.estado === 'programada' && (
            <div className="flex items-center gap-3 pt-1 border-t border-zinc-200">
              <button
                onClick={() => setEditando(true)}
                disabled={working}
                className="text-sm font-medium px-4 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                style={{ color: '#353542' }}
              >
                Editar clase
              </button>
              <button
                onClick={handleCancelarClase}
                disabled={working}
                className="text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                style={{ color: '#C04810', background: '#C0481012' }}
              >
                Cancelar esta clase
              </button>
            </div>
          )}

        </div>{/* fin cuerpo */}
      </div>{/* fin panel */}
    </div>
  );
}

function AsignarBoton({
  tenantId,
  claseId,
  alumno,
}: {
  tenantId: string;
  claseId: string;
  alumno: AlumnoDoc;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setWorking(true);
    setError(null);
    try {
      await apuntarseAClase(tenantId, claseId, alumno.alumnoId, alumno.tagsIds || []);
    } catch (e: any) {
      setError(e?.message || 'No se pudo asignar.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleClick}
        disabled={working}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
        style={{ background: '#09090F', color: '#E8A020' }}
      >
        {working ? '…' : 'Asignar'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
