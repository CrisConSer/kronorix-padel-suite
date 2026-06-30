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
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Calendario</h1>
          <p className="text-sm text-zinc-600 mt-1">Clases, cupos y lista de espera.</p>
        </div>
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <button
            onClick={() => {
              const r = mesAnterior(year, month);
              setYear(r.year);
              setMonth(r.month);
            }}
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
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
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            →
          </button>
        </div>
      </header>

      {loadingDatos ? (
        <p className="text-sm text-zinc-500">Cargando calendario…</p>
      ) : (
        <>
          {/* Grilla mensual — solo en sm: y superior */}
          <div className="hidden sm:block border border-zinc-200 rounded overflow-hidden bg-white">
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

          {/* Vista de agenda — solo en móvil */}
          <AgendaMovil
            celdas={celdas}
            clasesPorDia={clasesPorDia}
            hoyStr={hoyStr}
            tagsPorId={tagsPorId}
            alumnosPorId={alumnosPorId}
            onCrear={(fecha) => setFechaParaCrear(fecha)}
            onClickClase={(c) => setClaseSeleccionada(c)}
          />
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
  // Solo los días reales del mes (sin huecos null de relleno), y de
  // esos, solo los que tienen clases o son hoy — mostrar los 28-31 días
  // siempre, incluso vacíos, sería demasiado scroll en móvil.
  const diasDelMes = celdas.filter((f): f is string => !!f);
  const diasRelevantes = diasDelMes.filter(
    (fecha) => fecha === hoyStr || (clasesPorDia.get(fecha) || []).length > 0
  );

  return (
    <div className="sm:hidden space-y-2">
      <button
        onClick={() => onCrear(hoyStr)}
        className="w-full text-sm rounded border border-dashed border-zinc-300 text-zinc-500 hover:border-amber-400 hover:text-amber-600 px-3 py-2"
      >
        + Crear clase hoy
      </button>
      {diasRelevantes.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-6">
          No hay clases este mes todavía.
        </p>
      )}
      {diasRelevantes.map((fecha) => {
        const clases = clasesPorDia.get(fecha) || [];
        const esHoy = fecha === hoyStr;

        return (
          <div
            key={fecha}
            className={[
              'border rounded bg-white overflow-hidden',
              esHoy ? 'border-amber-300' : 'border-zinc-200',
            ].join(' ')}
          >
            <div
              className={[
                'flex items-center justify-between px-3 py-2 text-xs font-medium capitalize',
                esHoy ? 'bg-amber-50 text-amber-800' : 'bg-zinc-50 text-zinc-600',
              ].join(' ')}
            >
              <span>{formatoFechaLarga(fecha)}</span>
              <button
                onClick={() => onCrear(fecha)}
                className="text-zinc-400 hover:text-amber-600 text-sm leading-none px-1"
                title="Crear clase este día"
              >
                +
              </button>
            </div>

            {clases.length > 0 && (
              <ul className="divide-y divide-zinc-100">
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

                  return (
                    <li key={c.claseId}>
                      <button
                        onClick={() => onClickClase(c)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cancelada ? '#D4D4D8' : colorBase }}
                        />
                        <span className="text-sm font-medium text-zinc-900 shrink-0">{c.hora}</span>
                        <span
                          className={[
                            'text-sm truncate flex-1',
                            cancelada ? 'text-zinc-400 line-through' : 'text-zinc-600',
                          ].join(' ')}
                        >
                          {titulo}
                        </span>
                        <span className="text-xs text-zinc-400 shrink-0">
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
    setWorking(true);
    setError(null);
    try {
      const yaAsistio = clase.alumnosAsistieron.includes(alumno.alumnoId);
      if (yaAsistio) {
        await desmarcarAsistencia(tenantId, clase.claseId, alumno.alumnoId, alumno);
      } else {
        await marcarAsistencia(tenantId, clase.claseId, alumno.alumnoId, alumno);
      }
    } catch (e: any) {
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-zinc-900 capitalize">
            {clase.titulo ? `${clase.titulo} · ` : ''}
            {formatoFechaLarga(clase.fecha)} · {clase.hora}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {tagsDeLaClase.map((t) => (
            <span
              key={t.tagId}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.nombre}
            </span>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          {clase.tipo} · {clase.duracionMinutos} min{clase.pista ? ` · ${clase.pista}` : ''} ·{' '}
          {clase.alumnosIds.length}/{clase.capacidad} plazas
          {clase.estado !== 'programada' && (
            <span className="ml-2 text-red-600 font-medium">({clase.estado})</span>
          )}
        </p>

        {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2 mb-3">{error}</div>}

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Alumnos asignados</h3>
          {asignados.length === 0 ? (
            <p className="text-xs text-zinc-400">Sin alumnos asignados.</p>
          ) : (
            <ul className="space-y-1.5">
              {asignados.map((a) => {
                const asistio = clase.alumnosAsistieron.includes(a.alumnoId);
                return (
                  <li key={a.alumnoId} className="flex items-center justify-between text-sm gap-2 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={asistio}
                        disabled={working}
                        onChange={() => handleToggleAsistencia(a)}
                        className="rounded shrink-0"
                      />
                      <span className="truncate">{a.nombre}</span>
                      {a.modalidad === 'bono' && (
                        <span className="text-xs text-zinc-400 shrink-0">(bono)</span>
                      )}
                    </label>
                    {clase.estado === 'programada' && (
                      <div className="flex items-center gap-2 shrink-0">
                        {esFutura && (
                          <button
                            disabled={working}
                            onClick={() => handleBaja(a.alumnoId, true)}
                            className="text-xs text-amber-700 hover:underline disabled:opacity-50"
                            title="El alumno avisó que no puede venir"
                          >
                            Canceló
                          </button>
                        )}
                        <button
                          disabled={working}
                          onClick={() => handleBaja(a.alumnoId, false)}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          title="Quitarlo sin registrar como cancelación (ej. error al asignarlo)"
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

        {clase.estado === 'programada' && hayHueco && (
          <section className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-2">
              Hueco libre — alumnos compatibles (mismo tag)
            </h3>
            {compatibles.length === 0 ? (
              <p className="text-xs text-zinc-400">
                No hay alumnos con un tag en común con los ya asignados.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {compatibles.map((a) => (
                  <li key={a.alumnoId} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate min-w-0">{a.nombre}</span>
                    <AsignarBoton tenantId={tenantId} claseId={clase.claseId} alumno={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {enEspera.length > 0 && (
          <section className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-2">Lista de espera</h3>
            <ul className="space-y-1.5">
              {enEspera.map((a, i) => (
                <li key={a.alumnoId} className="text-sm text-zinc-600">
                  {i + 1}. {a.nombre}
                </li>
              ))}
            </ul>
          </section>
        )}

        {clase.notas && (
          <section className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-700 mb-1">Notas</h3>
            <p className="text-sm text-zinc-600">{clase.notas}</p>
          </section>
        )}

        {clase.estado === 'programada' && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEditando(true)}
              disabled={working}
              className="text-xs text-zinc-700 hover:underline disabled:opacity-50"
            >
              Editar clase
            </button>
            <button
              onClick={handleCancelarClase}
              disabled={working}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Cancelar esta clase
            </button>
          </div>
        )}
      </div>
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
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleClick}
        disabled={working}
        className="text-xs rounded border px-2 py-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        Asignar
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
