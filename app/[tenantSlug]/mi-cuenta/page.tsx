'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { AlumnoDoc, ClaseDoc, TagDoc } from '@/src/types';
import { apuntarseAClase, apuntarseAListaEspera, darBajaDeClase } from '@/src/calendarioClient';
import { pedirPermisoYGuardarToken } from '@/src/pushClient';
import {
  hoyYmd,
  formatoFechaLarga,
  nombreMes,
  gridDelMes,
  mesAnterior,
  mesSiguiente,
  diaDelMes,
  DIAS_SEMANA,
} from '@/src/dateHelpers';

/**
 * /[tenantSlug]/mi-cuenta
 * -----------------------------------------------------------------------
 * Vista del alumno: sus próximas clases confirmadas, y los huecos
 * libres a los que es compatible (comparte tag con los ya asignados)
 * en clases futuras donde todavía no está. Se apunta él mismo, sin
 * pasar por el profesor — mismo efecto final que si el profesor lo
 * asignara desde el calendario.
 * -----------------------------------------------------------------------
 */
export default function MiCuentaPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user, loading: loadingUser } = useSessionUser();
  const tenantId = user?.tenantId;
  const alumnoId = user?.alumnoId;

  const [miFicha, setMiFicha] = useState<AlumnoDoc | null>(null);
  const [clases, setClases] = useState<ClaseDoc[]>([]);
  const [tags, setTags] = useState<TagDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  const hoy = useMemo(() => new Date(), []);
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth());
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !alumnoId || user?.role !== 'alumno') return;
    // Antes esto leía TODA la colección de alumnos y filtraba en el
    // cliente — pero la regla de seguridad de /alumnos solo permite al
    // alumno leer SU PROPIO documento, no la colección entera. Una
    // query sobre la colección completa fallaba con permission-denied
    // porque Firestore exige que el alumno tuviera acceso a TODOS los
    // documentos que la query podría devolver, no solo al suyo. Leer
    // el documento directo por su id sí es válido contra esa regla.
    const unsub = onSnapshot(
      doc(db, 'tenants', tenantId, 'alumnos', alumnoId),
      (snap) => {
        if (snap.exists()) setMiFicha(snap.data() as AlumnoDoc);
      },
      (err) => {
        console.error('Error escuchando mi ficha de alumno:', err);
      }
    );
    return () => unsub();
  }, [tenantId, alumnoId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'alumno') return;
    const q = query(collection(db, 'tenants', tenantId, 'tags'), orderBy('nombre'));
    const unsub = onSnapshot(q, (snap) => {
      setTags(snap.docs.map((d) => d.data() as TagDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'alumno') return;
    const hoy = hoyYmd();
    const q = query(
      collection(db, 'tenants', tenantId, 'clases'),
      where('fecha', '>=', hoy),
      orderBy('fecha'),
      orderBy('hora')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setClases(snap.docs.map((d) => d.data() as ClaseDoc));
        setLoadingDatos(false);
      },
      (err) => {
        console.error('Error escuchando clases:', err);
        setLoadingDatos(false);
      }
    );
    return () => unsub();
  }, [tenantId, user?.role]);

  const misClases = useMemo(
    () =>
      alumnoId
        ? clases.filter((c) => c.alumnosIds.includes(alumnoId) && c.estado === 'programada')
        : [],
    [clases, alumnoId]
  );

  const misClasesEnEspera = useMemo(
    () =>
      alumnoId
        ? clases.filter((c) => c.listaEsperaIds.includes(alumnoId) && c.estado === 'programada')
        : [],
    [clases, alumnoId]
  );

  const huecosCompatibles = useMemo(() => {
    if (!miFicha) return [];
    const misTags = new Set(miFicha.tagsIds || []);
    return clases.filter((c) => {
      if (c.estado !== 'programada') return false;
      if (alumnoId && c.alumnosIds.includes(alumnoId)) return false;
      if (alumnoId && c.listaEsperaIds.includes(alumnoId)) return false;
      if (c.alumnosIds.length >= c.capacidad) return false;
      return (c.tagsCompatibles || []).some((t) => misTags.has(t));
    });
  }, [clases, miFicha, alumnoId]);

  // Mini-calendario: clases donde el alumno está confirmado, MÁS los
  // huecos libres compatibles con su tag (donde podría apuntarse) —
  // antes solo se pintaban las confirmadas, así que un hueco disponible
  // (como el que ve en "Huecos disponibles" más abajo) no aparecía
  // marcado en el calendario, aunque sí en esa lista. Cada entrada lleva
  // un flag `confirmada` para poder pintarlas con colores/estilos
  // distintos y mostrar el botón correcto al hacer clic en el día.
  //
  // Nota: la query de `clases` solo trae fechas >= hoy, así que navegar
  // a meses anteriores no mostrará datos — limitación aceptada para
  // esta primera versión, igual que el calendario del profesor no
  // pagina por rango de fechas todavía.
  const misClasesPorDia = useMemo(() => {
    const map = new Map<string, { clase: ClaseDoc; confirmada: boolean }[]>();
    if (!alumnoId) return map;
    const idsHuecos = new Set(huecosCompatibles.map((c) => c.claseId));

    clases.forEach((c) => {
      if (c.estado !== 'programada') return;
      const confirmada = c.alumnosIds.includes(alumnoId);
      const esHuecoCompatible = idsHuecos.has(c.claseId);
      if (!confirmada && !esHuecoCompatible) return;

      const lista = map.get(c.fecha) || [];
      lista.push({ clase: c, confirmada });
      map.set(c.fecha, lista);
    });
    return map;
  }, [clases, alumnoId, huecosCompatibles]);

  const tagsPorId = useMemo(() => {
    const map = new Map<string, TagDoc>();
    tags.forEach((t) => map.set(t.tagId, t));
    return map;
  }, [tags]);

  const celdas = useMemo(() => gridDelMes(year, month), [year, month]);
  const hoyStr = hoyYmd();
  const entradasDelDiaSeleccionado = diaSeleccionado ? misClasesPorDia.get(diaSeleccionado) || [] : [];

  if (loadingUser) return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  if (!user || user.role !== 'alumno' || user.tenantSlug !== params.tenantSlug) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Mi cuenta</h1>
        <p className="text-sm text-zinc-600 mt-1">Tus próximas clases y huecos disponibles.</p>
      </header>

      <AvisoNotificaciones uid={user.uid} />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-zinc-900">Calendario</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const r = mesAnterior(year, month);
                setYear(r.year);
                setMonth(r.month);
                setDiaSeleccionado(null);
              }}
              className="rounded border px-2 py-1 text-sm hover:bg-zinc-50"
            >
              ←
            </button>
            <span className="text-xs sm:text-sm font-medium text-zinc-700 w-24 sm:w-32 text-center capitalize">
              {nombreMes(year, month)}
            </span>
            <button
              onClick={() => {
                const r = mesSiguiente(year, month);
                setYear(r.year);
                setMonth(r.month);
                setDiaSeleccionado(null);
              }}
              className="rounded border px-2 py-1 text-sm hover:bg-zinc-50"
            >
              →
            </button>
          </div>
        </div>

        <div className="border border-zinc-200 rounded overflow-hidden bg-white">
          <div className="grid grid-cols-7 bg-zinc-50 border-b border-zinc-200 text-xs font-medium text-zinc-500">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="p-1.5 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {celdas.map((fecha, i) => {
              if (!fecha) {
                return <div key={i} className="aspect-square border-b border-r border-zinc-100 bg-zinc-50/40" />;
              }
              const entradasDelDia = misClasesPorDia.get(fecha) || [];
              const tieneAlgo = entradasDelDia.length > 0;
              const tieneConfirmada = entradasDelDia.some((e) => e.confirmada);
              const tieneHueco = entradasDelDia.some((e) => !e.confirmada);
              // Color: el del primer tag compatible de la primera entrada del día.
              const tagDelDia = tieneAlgo
                ? (entradasDelDia[0].clase.tagsCompatibles || []).map((id) => tagsPorId.get(id)).find((t) => !!t)
                : undefined;
              const color = tagDelDia?.color || '#E8A020';
              const esHoy = fecha === hoyStr;
              const seleccionado = fecha === diaSeleccionado;

              return (
                <button
                  key={i}
                  onClick={() => tieneAlgo && setDiaSeleccionado(fecha)}
                  className={[
                    'aspect-square border-b border-r border-zinc-100 flex flex-col items-center justify-center gap-0.5 text-xs relative',
                    tieneAlgo ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default',
                    seleccionado ? 'ring-2 ring-inset ring-amber-400' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-5 h-5 flex items-center justify-center rounded-full',
                      esHoy ? 'bg-amber-500 text-zinc-950 font-medium' : 'text-zinc-600',
                    ].join(' ')}
                  >
                    {diaDelMes(fecha)}
                  </span>
                  {tieneConfirmada && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {!tieneConfirmada && tieneHueco && (
                    <span
                      className="w-1.5 h-1.5 rounded-full border"
                      style={{ borderColor: color }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {diaSeleccionado && entradasDelDiaSeleccionado.length > 0 && (
          <div className="mt-3 border border-zinc-200 rounded bg-white p-3 space-y-3">
            <p className="text-xs font-medium text-zinc-500 capitalize">
              {formatoFechaLarga(diaSeleccionado)}
            </p>
            {entradasDelDiaSeleccionado.map(({ clase: c, confirmada }) => (
              <EntradaDiaDetalle
                key={c.claseId}
                clase={c}
                confirmada={confirmada}
                tagsPorId={tagsPorId}
                tenantId={tenantId!}
                alumnoId={alumnoId!}
                misTagsIds={miFicha?.tagsIds || []}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Mis próximas clases</h2>
        {loadingDatos ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : misClases.length === 0 && misClasesEnEspera.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes clases programadas todavía.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {misClases.map((c) => (
              <MiClaseRow key={c.claseId} clase={c} tenantId={tenantId!} alumnoId={alumnoId!} enEspera={false} />
            ))}
            {misClasesEnEspera.map((c) => (
              <MiClaseRow key={c.claseId} clase={c} tenantId={tenantId!} alumnoId={alumnoId!} enEspera />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Huecos disponibles</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Clases con alguna plaza libre. Tu profesor confirmará que el grupo es compatible
          con tu nivel.
        </p>
        {huecosCompatibles.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay huecos disponibles ahora mismo.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {huecosCompatibles.map((c) => (
              <HuecoRow
                key={c.claseId}
                clase={c}
                tenantId={tenantId!}
                alumnoId={alumnoId!}
                misTagsIds={miFicha?.tagsIds || []}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MiClaseRow({
  clase,
  tenantId,
  alumnoId,
  enEspera,
}: {
  clase: ClaseDoc;
  tenantId: string;
  alumnoId: string;
  enEspera: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBaja() {
    if (!confirm('¿Seguro que quieres darte de baja de esta clase?')) return;
    setWorking(true);
    setError(null);
    try {
      // Las clases que ve mi-cuenta son siempre futuras (la query las
      // filtra por fecha >= hoy), así que esta baja siempre cuenta como
      // cancelación avisada con antelación.
      await darBajaDeClase(tenantId, clase.claseId, alumnoId, undefined, true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo procesar la baja.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="font-medium text-zinc-900 capitalize">
          {formatoFechaLarga(clase.fecha)} · {clase.hora}
        </div>
        {clase.titulo && (
          <div className="text-sm text-zinc-700 font-medium mt-0.5">{clase.titulo}</div>
        )}
        <div className="text-xs text-zinc-500 mt-0.5">
          {clase.tipo} · {clase.duracionMinutos} min{clase.pista ? ` · ${clase.pista}` : ''}
          {enEspera && <span className="ml-2 text-amber-600 font-medium">en lista de espera</span>}
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
      <button
        onClick={handleBaja}
        disabled={working}
        className="text-xs rounded border px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 shrink-0"
      >
        Darme de baja
      </button>
    </li>
  );
}

function HuecoRow({
  clase,
  tenantId,
  alumnoId,
  misTagsIds,
}: {
  clase: ClaseDoc;
  tenantId: string;
  alumnoId: string;
  misTagsIds: string[];
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  async function handleApuntarse() {
    setWorking(true);
    setError(null);
    try {
      await apuntarseAClase(tenantId, clase.claseId, alumnoId, misTagsIds);
      setHecho(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar.');
    } finally {
      setWorking(false);
    }
  }

  async function handleListaEspera() {
    setWorking(true);
    setError(null);
    try {
      await apuntarseAListaEspera(tenantId, clase.claseId, alumnoId, misTagsIds);
      setHecho(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar.');
    } finally {
      setWorking(false);
    }
  }

  const plazasLibres = clase.capacidad - clase.alumnosIds.length;

  return (
    <li className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="font-medium text-zinc-900 capitalize">
          {formatoFechaLarga(clase.fecha)} · {clase.hora}
        </div>
        {clase.titulo && (
          <div className="text-sm text-zinc-700 font-medium mt-0.5">{clase.titulo}</div>
        )}
        <div className="text-xs text-zinc-500 mt-0.5">
          {clase.tipo} · {plazasLibres} plaza{plazasLibres > 1 ? 's' : ''} libre
          {plazasLibres > 1 ? 's' : ''}
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
      {hecho ? (
        <span className="text-xs text-emerald-700 font-medium shrink-0">¡Apuntado!</span>
      ) : (
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleApuntarse}
            disabled={working}
            className="text-xs rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 font-medium px-3 py-1.5"
          >
            Apuntarme
          </button>
        </div>
      )}
    </li>
  );
}

function AvisoNotificaciones({ uid }: { uid: string }) {
  const [estado, setEstado] = useState<'inicial' | 'pidiendo' | 'activado' | 'error'>('inicial');
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Si el navegador ya tiene el permiso concedido de antes (de una
  // sesión previa), no insistimos con el aviso.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') setEstado('activado');
      if (Notification.permission === 'denied') setEstado('error');
    }
  }, []);

  async function handleActivar() {
    setEstado('pidiendo');
    setMensaje(null);
    const resultado = await pedirPermisoYGuardarToken(uid);
    if (resultado.ok) {
      setEstado('activado');
    } else {
      setEstado('error');
      if (resultado.motivo === 'no-soportado') {
        setMensaje('Tu navegador no soporta notificaciones push.');
      } else if (resultado.motivo === 'permiso-denegado') {
        setMensaje('Has bloqueado las notificaciones. Puedes activarlas desde los ajustes del navegador.');
      } else {
        setMensaje('No se pudo activar. Inténtalo de nuevo más tarde.');
      }
    }
  }

  if (estado === 'activado') {
    return (
      <div className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">
        Recordatorios activados — te avisaremos 24h antes de cada clase.
      </div>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <span className="text-xs text-amber-800">
        Activa los avisos para recibir un recordatorio 24h antes de cada clase.
      </span>
      <button
        onClick={handleActivar}
        disabled={estado === 'pidiendo'}
        className="text-xs rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-3 py-1.5 shrink-0"
      >
        {estado === 'pidiendo' ? 'Activando…' : 'Activar recordatorios'}
      </button>
      {mensaje && <p className="text-xs text-red-600 w-full">{mensaje}</p>}
    </div>
  );
}

function EntradaDiaDetalle({
  clase,
  confirmada,
  tagsPorId,
  tenantId,
  alumnoId,
  misTagsIds,
}: {
  clase: ClaseDoc;
  confirmada: boolean;
  tagsPorId: Map<string, TagDoc>;
  tenantId: string;
  alumnoId: string;
  misTagsIds: string[];
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apuntado, setApuntado] = useState(false);

  const tagsDeLaClase = (clase.tagsCompatibles || [])
    .map((id) => tagsPorId.get(id))
    .filter((t): t is TagDoc => !!t);

  const plazasLibres = clase.capacidad - clase.alumnosIds.length;

  async function handleApuntarse() {
    setWorking(true);
    setError(null);
    try {
      await apuntarseAClase(tenantId, clase.claseId, alumnoId, misTagsIds);
      setApuntado(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-zinc-900">{clase.hora}</span>
        {clase.titulo && (
          <span className="font-medium text-zinc-900">{clase.titulo}</span>
        )}
        <span className="text-zinc-500">
          {clase.tipo} · {clase.duracionMinutos} min{clase.pista ? ` · ${clase.pista}` : ''}
        </span>
        {tagsDeLaClase.map((t) => (
          <span
            key={t.tagId}
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${t.color}22`, color: t.color }}
          >
            {t.nombre}
          </span>
        ))}
        <span
          className={[
            'text-xs px-2 py-0.5 rounded-full font-medium',
            confirmada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {confirmada ? 'Apuntado' : `${plazasLibres} plaza${plazasLibres > 1 ? 's' : ''} libre${plazasLibres > 1 ? 's' : ''}`}
        </span>
        {error && <span className="text-xs text-red-600 w-full">{error}</span>}
      </div>
      {!confirmada && !apuntado && (
        <button
          onClick={handleApuntarse}
          disabled={working}
          className="text-xs rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 font-medium px-3 py-1.5 shrink-0"
        >
          {working ? 'Apuntando…' : 'Apuntarme'}
        </button>
      )}
      {apuntado && <span className="text-xs text-emerald-700 font-medium shrink-0">¡Apuntado!</span>}
    </div>
  );
}
