'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { AlumnoDoc, ModalidadAlumno, TagDoc } from '@/src/types';
import { crearAlumno, actualizarAlumno } from '@/src/alumnosClient';
import { crearTag, borrarTag } from '@/src/tagsClient';
import { invitarAlumnoYEnviarEmail } from '@/src/invitarAlumnoClient';

/**
 * /[tenantSlug]/alumnos
 * -----------------------------------------------------------------------
 * Solo accesible para el admin del tenant (el layout padre ya bloquea
 * a alumnos y a super_admin antes de llegar aquí, pero además
 * comprobamos el modo explícitamente para no mostrar ni un parpadeo
 * de UI de gestión a quien no debería verla).
 * -----------------------------------------------------------------------
 */
export default function AlumnosPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user, loading: loadingUser } = useSessionUser();

  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [filtro, setFiltro] = useState<'activos' | 'todos'>('activos');

  // Filtros locales (no requieren nueva query a Firestore)
  const [busqueda, setBusqueda] = useState('');
  const [filtroTag, setFiltroTag] = useState<string>(''); // tagId o ''
  const [filtroModalidad, setFiltroModalidad] = useState<string>(''); // 'bono'|'suelta'|''

  const [tags, setTags] = useState<TagDoc[]>([]);
  const [editando, setEditando] = useState<AlumnoDoc | null>(null);
  const [mostrarGestorTags, setMostrarGestorTags] = useState(false);

  const tenantId = user?.tenantId;
  const tagsPorId = useMemo(() => {
    const map = new Map<string, TagDoc>();
    tags.forEach((t) => map.set(t.tagId, t));
    return map;
  }, [tags]);

  // Alumnos filtrados localmente (búsqueda + tag + modalidad)
  const alumnosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return alumnos.filter((a) => {
      if (q && !a.nombre.toLowerCase().includes(q) && !(a.email || '').toLowerCase().includes(q)) return false;
      if (filtroTag && !(a.tagsIds || []).includes(filtroTag)) return false;
      if (filtroModalidad && a.modalidad !== filtroModalidad) return false;
      return true;
    });
  }, [alumnos, busqueda, filtroTag, filtroModalidad]);

  // Alumnos
  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;

    const baseRef = collection(db, 'tenants', tenantId, 'alumnos');
    const q =
      filtro === 'activos'
        ? query(baseRef, where('estado', '==', 'activo'), orderBy('nombre'))
        : query(baseRef, orderBy('nombre'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAlumnos(snap.docs.map((d) => d.data() as AlumnoDoc));
        setLoadingAlumnos(false);
      },
      (err) => {
        console.error('Error escuchando alumnos:', err);
        setLoadingAlumnos(false);
      }
    );
    return () => unsub();
  }, [tenantId, filtro, user?.role]);

  // Tags (catálogo del tenant)
  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(collection(db, 'tenants', tenantId, 'tags'), orderBy('nombre'));
    const unsub = onSnapshot(q, (snap) => {
      setTags(snap.docs.map((d) => d.data() as TagDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  if (loadingUser) {
    return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  }

  if (!user || user.role !== 'admin' || user.tenantSlug !== params.tenantSlug) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-6">
      {/* ── HEADER ── */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>Alumnos</h1>
          <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>Altas, bajas y datos de tus alumnos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarGestorTags(true)}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
            style={{ color: '#353542' }}
          >
            Gestionar tags
          </button>
          {/* Toggle activos/todos */}
          <div className="flex rounded-xl p-1 gap-1" style={{ background: '#09090F' }}>
            <button
              onClick={() => setFiltro('activos')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: filtro === 'activos' ? '#E8A020' : 'transparent',
                color: filtro === 'activos' ? '#09090F' : '#F4EFE660',
              }}
            >
              Activos
            </button>
            <button
              onClick={() => setFiltro('todos')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: filtro === 'todos' ? '#E8A020' : 'transparent',
                color: filtro === 'todos' ? '#09090F' : '#F4EFE660',
              }}
            >
              Todos
            </button>
          </div>
        </div>
      </header>

      {/* ── FORMULARIO NUEVO ALUMNO (colapsable) ── */}
      <NuevoAlumnoPanel tenantId={tenantId!} createdBy={user.uid} tags={tags} />

      {/* ── BUSCADOR Y FILTROS ── */}
      <div className="space-y-3">
        {/* Buscador */}
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 transition-colors"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
            >
              ×
            </button>
          )}
        </div>

        {/* Filtros por tag y modalidad */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#a1a1aa' }}>Filtrar:</span>

          {/* Tags */}
          {tags.map((t) => (
            <button
              key={t.tagId}
              onClick={() => setFiltroTag(filtroTag === t.tagId ? '' : t.tagId)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
              style={
                filtroTag === t.tagId
                  ? { background: t.color, color: '#fff' }
                  : { background: `${t.color}18`, color: t.color, border: `1.5px solid ${t.color}40` }
              }
            >
              {t.nombre}
            </button>
          ))}

          {/* Modalidad */}
          {(['bono', 'suelta'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFiltroModalidad(filtroModalidad === m ? '' : m)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all border"
              style={
                filtroModalidad === m
                  ? { background: '#09090F', color: '#E8A020', borderColor: '#09090F' }
                  : { background: 'white', color: '#353542', borderColor: '#e4e4e7' }
              }
            >
              {m === 'bono' ? 'Bono' : 'Suelta'}
            </button>
          ))}

          {/* Reset */}
          {(filtroTag || filtroModalidad) && (
            <button
              onClick={() => { setFiltroTag(''); setFiltroModalidad(''); }}
              className="text-xs text-zinc-400 hover:text-zinc-700 underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── LISTADO ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            {filtro === 'activos' ? 'Activos' : 'Todos'}
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#09090F', color: '#E8A020' }}>
            {alumnosFiltrados.length}
          </span>
        </div>

        {loadingAlumnos ? (
          <p className="text-sm text-zinc-500">Cargando alumnos…</p>
        ) : alumnosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-10 text-center">
            <p className="text-sm text-zinc-400">
              {alumnos.length === 0
                ? filtro === 'activos' ? 'No tienes alumnos activos todavía.' : 'No tienes alumnos registrados.'
                : 'No hay alumnos que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alumnosFiltrados.map((a) => (
              <AlumnoRow
                key={a.alumnoId}
                alumno={a}
                tenantId={tenantId!}
                tagsPorId={tagsPorId}
                onEditar={() => setEditando(a)}
              />
            ))}
          </ul>
        )}
      </section>

      {editando && (
        <EditarAlumnoModal
          tenantId={tenantId!}
          alumno={editando}
          tags={tags}
          onClose={() => setEditando(null)}
        />
      )}

      {mostrarGestorTags && (
        <GestorTagsModal
          tenantId={tenantId!}
          createdBy={user.uid}
          tags={tags}
          onClose={() => setMostrarGestorTags(false)}
        />
      )}
    </div>
  );
}

/**
 * Panel de nuevo alumno: colapsado por defecto, se expande al pulsar.
 * Evita que el formulario ocupe espacio visual cuando el profesor solo
 * quiere buscar o gestionar alumnos existentes.
 */
function NuevoAlumnoPanel({
  tenantId,
  createdBy,
  tags,
}: {
  tenantId: string;
  createdBy: string;
  tags: TagDoc[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ border: abierto ? '1.5px solid #09090F' : '1.5px dashed #E8A02070', background: abierto ? 'white' : '#F4EFE6' }}
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span
          className="w-7 h-7 flex items-center justify-center rounded-full text-base font-bold shrink-0 transition-transform"
          style={{
            background: '#E8A020',
            color: '#09090F',
            transform: abierto ? 'rotate(45deg)' : 'none',
          }}
        >
          +
        </span>
        <span className="text-sm font-semibold" style={{ color: '#353542' }}>
          {abierto ? 'Cerrar formulario' : 'Añadir nuevo alumno'}
        </span>
      </button>

      {abierto && (
        <div className="px-5 pb-5 pt-1 border-t border-zinc-100">
          <AlumnoForm
            tenantId={tenantId}
            createdBy={createdBy}
            tags={tags}
            modo="crear"
            onDone={() => setAbierto(false)}
          />
        </div>
      )}
    </div>
  );
}

function AlumnoRow({
  alumno,
  tenantId,
  tagsPorId,
  onEditar,
}: {
  alumno: AlumnoDoc;
  tenantId: string;
  tagsPorId: Map<string, TagDoc>;
  onEditar: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  const modalidadLabel: Record<ModalidadAlumno, string> = {
    bono: 'Bono',
    suelta: 'Suelta',
  };

  async function darBaja() {
    setWorking(true);
    setConfirmandoBaja(false);
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'alumnos', alumno.alumnoId), {
        estado: 'baja',
        fechaBaja: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error dando de baja:', e);
    } finally {
      setWorking(false);
    }
  }

  async function reactivar() {
    setWorking(true);
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'alumnos', alumno.alumnoId), {
        estado: 'activo',
        fechaBaja: null,
      });
    } catch (e) {
      console.error('Error reactivando:', e);
      alert('No se pudo reactivar. Inténtalo de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  async function handleInvitar() {
    if (!alumno.email) {
      alert('Este alumno no tiene email. Añádelo desde "Editar" antes de invitarlo.');
      return;
    }
    setInvitando(true);
    setInviteFeedback(null);
    try {
      const resultado = await invitarAlumnoYEnviarEmail(
        { tenantId, alumnoId: alumno.alumnoId },
        alumno.email
      );
      setInviteFeedback(
        resultado.reenvio
          ? 'Email reenviado.'
          : 'Acceso creado y email enviado.'
      );
    } catch (e: any) {
      setInviteFeedback(e?.message || 'No se pudo enviar la invitación.');
    } finally {
      setInvitando(false);
    }
  }

  const tagsDelAlumno = (alumno.tagsIds || [])
    .map((id) => tagsPorId.get(id))
    .filter((t): t is TagDoc => !!t);

  const esBaja = alumno.estado === 'baja';

  return (
    <li
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: esBaja ? '1.5px solid #e4e4e7' : '1.5px solid #e4e4e7',
        background: esBaja ? '#fafafa' : 'white',
        opacity: esBaja ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-0">
        {/* Franja de color del tag principal */}
        <div
          className="w-1 self-stretch shrink-0"
          style={{ background: tagsDelAlumno[0]?.color || '#e4e4e7' }}
        />

        <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3 flex-wrap min-w-0">
          {/* Info */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm" style={{ color: esBaja ? '#a1a1aa' : '#09090F' }}>
                {alumno.nombre}
              </span>
              {esBaja && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-400 uppercase tracking-wide">
                  De baja
                </span>
              )}
              {/* Tags */}
              {tagsDelAlumno.map((t) => (
                <span
                  key={t.tagId}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30` }}
                >
                  {t.nombre}
                </span>
              ))}
              {/* Modalidad */}
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ borderColor: '#e4e4e7', color: '#71717a' }}
              >
                {modalidadLabel[alumno.modalidad]}
              </span>
            </div>

            <div className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: '#a1a1aa' }}>
              {alumno.email && <span>{alumno.email}</span>}
              {alumno.email && alumno.telefono && <span>·</span>}
              {alumno.telefono && <span>{alumno.telefono}</span>}
              {alumno.nivel && <><span>·</span><span>{alumno.nivel}</span></>}
            </div>

            <div className="text-xs flex items-center gap-1.5">
              {alumno.uid ? (
                <span className="font-medium" style={{ color: '#16a34a' }}>✓ Acceso activo</span>
              ) : (
                <span style={{ color: '#a1a1aa' }}>Sin acceso a la app</span>
              )}
              {inviteFeedback && (
                <span style={{ color: '#71717a' }}>· {inviteFeedback}</span>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
            {confirmandoBaja ? (
              <>
                <button
                  onClick={() => setConfirmandoBaja(false)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-500"
                >
                  No
                </button>
                <button
                  onClick={darBaja}
                  disabled={working}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                  style={{ background: '#C04810', color: 'white' }}
                >
                  Sí, dar de baja
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleInvitar}
                  disabled={invitando}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 font-medium disabled:opacity-50 hover:bg-zinc-50 transition-colors"
                  style={{ color: '#92400e' }}
                >
                  {invitando ? '…' : alumno.uid ? 'Reenviar' : 'Invitar'}
                </button>
                <button
                  onClick={onEditar}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 font-medium hover:bg-zinc-50 transition-colors"
                  style={{ color: '#353542' }}
                >
                  Editar
                </button>
                {esBaja ? (
                  <button
                    onClick={reactivar}
                    disabled={working}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-colors"
                    style={{ background: '#09090F', color: '#E8A020' }}
                  >
                    Reactivar
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmandoBaja(true)}
                    disabled={working}
                    className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-50 transition-colors hover:bg-red-50"
                    style={{ borderColor: '#fca5a5', color: '#C04810' }}
                  >
                    Baja
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * AlumnoForm
 * -----------------------------------------------------------------------
 * Formulario reutilizado para CREAR (en la página, siempre visible) y
 * para EDITAR (dentro del modal). El modo 'editar' precarga los valores
 * del alumno y llama a actualizarAlumno en vez de crearAlumno.
 * -----------------------------------------------------------------------
 */
function AlumnoForm({
  tenantId,
  createdBy,
  tags,
  modo,
  alumnoExistente,
  onDone,
}: {
  tenantId: string;
  createdBy: string;
  tags: TagDoc[];
  modo: 'crear' | 'editar';
  alumnoExistente?: AlumnoDoc;
  onDone: () => void;
}) {
  const [nombre, setNombre] = useState(alumnoExistente?.nombre || '');
  const [email, setEmail] = useState(alumnoExistente?.email || '');
  const [telefono, setTelefono] = useState(alumnoExistente?.telefono || '');
  const [nivel, setNivel] = useState(alumnoExistente?.nivel || '');
  const [modalidad, setModalidad] = useState<ModalidadAlumno>(alumnoExistente?.modalidad || 'bono');
  const [notas, setNotas] = useState(alumnoExistente?.notas || '');
  const [tagsIds, setTagsIds] = useState<string[]>(alumnoExistente?.tagsIds || []);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  const puedeEnviar = useMemo(
    () => nombre.trim().length > 0 && tagsIds.length > 0,
    [nombre, tagsIds]
  );

  function toggleTag(tagId: string) {
    setTagsIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!puedeEnviar) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (modo === 'crear') {
        const emailTrim = email.trim();
        const alumnoId = await crearAlumno(tenantId, {
          nombre: nombre.trim(),
          email: emailTrim || undefined,
          telefono: telefono.trim() || undefined,
          nivel: nivel.trim() || undefined,
          modalidad,
          notas: notas.trim() || undefined,
          tagsIds,
          createdBy,
        });

        if (emailTrim) {
          try {
            await invitarAlumnoYEnviarEmail({ tenantId, alumnoId }, emailTrim);
            setFeedback({
              type: 'ok',
              msg: `${nombre} se ha añadido y se le ha enviado un email a ${emailTrim} para acceder a la app.`,
            });
          } catch (inviteError: any) {
            // El alumno ya está creado aunque la invitación falle —
            // se puede reintentar con el botón "Invitar" de su fila.
            setFeedback({
              type: 'ok',
              msg: `${nombre} se ha añadido, pero no se pudo enviar el email de invitación. Puedes reintentarlo desde su ficha.`,
            });
          }
        } else {
          setFeedback({ type: 'ok', msg: `${nombre} se ha añadido correctamente.` });
        }

        setNombre('');
        setEmail('');
        setTelefono('');
        setNivel('');
        setModalidad('bono');
        setNotas('');
        setTagsIds([]);
      } else if (alumnoExistente) {
        await actualizarAlumno(tenantId, alumnoExistente.alumnoId, {
          nombre: nombre.trim(),
          email: email.trim() || undefined,
          telefono: telefono.trim() || undefined,
          nivel: nivel.trim() || undefined,
          modalidad,
          notas: notas.trim() || undefined,
          tagsIds,
        });
        onDone();
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e?.message || 'No se pudo guardar.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {modo === 'crear' && <h2 className="text-lg font-semibold text-zinc-900">Nuevo alumno</h2>}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Estefi García"
          />
        </Field>

        <Field label="Modalidad">
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as ModalidadAlumno)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="bono">Bono mensual</option>
            <option value="suelta">Clase suelta</option>
          </select>
        </Field>

        <Field label="Email (opcional)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="estefi@ejemplo.com"
          />
        </Field>

        <Field label="Teléfono (opcional)">
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="600 000 000"
          />
        </Field>

        <Field label="Nivel (opcional)">
          <input
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Iniciación / Intermedio / Avanzado"
          />
        </Field>

        <Field label="Tags (obligatorio: al menos 1)">
          {tags.length === 0 ? (
            <p className="text-xs text-red-500 pt-2">
              Todavía no tienes tags creados. Usa "Gestionar tags" arriba — necesitas al
              menos uno para poder guardar alumnos.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((t) => {
                  const activo = tagsIds.includes(t.tagId);
                  return (
                    <button
                      type="button"
                      key={t.tagId}
                      onClick={() => toggleTag(t.tagId)}
                      className="text-xs px-2.5 py-1 rounded-full font-medium border transition-colors"
                      style={
                        activo
                          ? { backgroundColor: t.color, color: '#fff', borderColor: t.color }
                          : { backgroundColor: '#fff', color: t.color, borderColor: t.color }
                      }
                    >
                      {t.nombre}
                    </button>
                  );
                })}
              </div>
              {tagsIds.length === 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Selecciona al menos un tag (el calendario lo necesita para mostrar
                  huecos compatibles).
                </p>
              )}
            </>
          )}
        </Field>
      </div>

      <Field label="Notas (opcional)">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Anotaciones privadas: lesiones, preferencias de horario, observaciones..."
        />
      </Field>

      {feedback && (
        <div
          className={[
            'text-sm rounded px-3 py-2',
            feedback.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
          ].join(' ')}
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !puedeEnviar}
          className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors"
          style={{ background: '#09090F', color: '#E8A020' }}
        >
          {submitting ? 'Guardando…' : modo === 'crear' ? 'Añadir alumno' : 'Guardar cambios'}
        </button>
        {modo === 'editar' && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function EditarAlumnoModal({
  tenantId,
  alumno,
  tags,
  onClose,
}: {
  tenantId: string;
  alumno: AlumnoDoc;
  tags: TagDoc[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ background: '#09090F', borderRadius: 'inherit inherit 0 0' }}
        >
          <h2 className="text-base font-bold text-white">Editar alumno</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors text-lg">×</button>
        </div>
        <div className="px-5 py-5">
          <AlumnoForm
            tenantId={tenantId}
            createdBy={alumno.createdBy}
            tags={tags}
            modo="editar"
            alumnoExistente={alumno}
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}

function GestorTagsModal({
  tenantId,
  createdBy,
  tags,
  onClose,
}: {
  tenantId: string;
  createdBy: string;
  tags: TagDoc[];
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#E8A020');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCrear(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await crearTag(tenantId, { nombre: nombre.trim(), color, createdBy });
      setNombre('');
      setColor('#E8A020');
    } catch (e: any) {
      setError(e?.message || 'No se pudo crear el tag.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBorrar(tagId: string) {
    if (!confirm('¿Borrar este tag? Se quitará de cualquier alumno que lo tuviera asignado.')) return;
    try {
      await borrarTag(tenantId, tagId);
    } catch (e) {
      console.error('Error borrando tag:', e);
      alert('No se pudo borrar el tag.');
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto flex flex-col"
        style={{ background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ background: '#09090F' }}
        >
          <h2 className="text-base font-bold text-white">Gestionar tags</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors text-lg">×</button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <form onSubmit={handleCrear} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#353542' }}>
                Nuevo tag
              </label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-zinc-400"
                placeholder="Ej. Competición"
              />
            </div>
            <label className="block shrink-0">
              <span className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#353542' }}>Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 border border-zinc-200 rounded-xl cursor-pointer"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || !nombre.trim()}
              className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors shrink-0"
              style={{ background: '#09090F', color: '#E8A020' }}
            >
              {submitting ? '…' : 'Crear'}
            </button>
          </form>

          {error && (
            <div className="text-sm rounded-xl px-4 py-3" style={{ background: '#C0481015', color: '#C04810' }}>
              {error}
            </div>
          )}

          {tags.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-4">No tienes tags creados todavía.</p>
          ) : (
            <ul className="space-y-2">
              {tags.map((t) => (
                <li
                  key={t.tagId}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-white border border-zinc-200"
                >
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                    style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30` }}
                  >
                    {t.nombre}
                  </span>
                  <button
                    onClick={() => handleBorrar(t.tagId)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-red-50"
                    style={{ color: '#C04810' }}
                  >
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
