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

  const [tags, setTags] = useState<TagDoc[]>([]);
  const [editando, setEditando] = useState<AlumnoDoc | null>(null);
  const [mostrarGestorTags, setMostrarGestorTags] = useState(false);

  const tenantId = user?.tenantId;
  const tagsPorId = useMemo(() => {
    const map = new Map<string, TagDoc>();
    tags.forEach((t) => map.set(t.tagId, t));
    return map;
  }, [tags]);

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
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Alumnos</h1>
          <p className="text-sm text-zinc-600 mt-1">Altas, bajas y datos de tus alumnos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMostrarGestorTags(true)}
            className="text-sm rounded border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
          >
            Gestionar tags
          </button>
          <div className="inline-flex rounded border border-zinc-300 overflow-hidden text-sm">
            <button
              onClick={() => setFiltro('activos')}
              className={[
                'px-3 py-1.5',
                filtro === 'activos' ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-white text-zinc-600',
              ].join(' ')}
            >
              Activos
            </button>
            <button
              onClick={() => setFiltro('todos')}
              className={[
                'px-3 py-1.5',
                filtro === 'todos' ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-white text-zinc-600',
              ].join(' ')}
            >
              Todos
            </button>
          </div>
        </div>
      </header>

      <div className="border border-zinc-200 rounded p-5 bg-white">
        <AlumnoForm
          tenantId={tenantId!}
          createdBy={user.uid}
          tags={tags}
          modo="crear"
          onDone={() => {}}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          Listado {filtro === 'activos' ? '(activos)' : '(todos)'}
        </h2>
        {loadingAlumnos ? (
          <p className="text-sm text-zinc-500">Cargando alumnos…</p>
        ) : alumnos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {filtro === 'activos' ? 'No tienes alumnos activos todavía.' : 'No tienes alumnos registrados.'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {alumnos.map((a) => (
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

  const modalidadLabel: Record<ModalidadAlumno, string> = {
    bono: 'Bono mensual',
    suelta: 'Clase suelta',
  };

  async function darBaja() {
    if (!confirm(`¿Dar de baja a ${alumno.nombre}? Podrás verlo igual en "Todos".`)) return;
    setWorking(true);
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'alumnos', alumno.alumnoId), {
        estado: 'baja',
        fechaBaja: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error dando de baja:', e);
      alert('No se pudo dar de baja. Inténtalo de nuevo.');
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

  const tagsDelAlumno = (alumno.tagsIds || [])
    .map((id) => tagsPorId.get(id))
    .filter((t): t is TagDoc => !!t);

  return (
    <li className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="font-medium text-zinc-900 flex items-center gap-2 flex-wrap">
          {alumno.nombre}
          {alumno.estado === 'baja' && (
            <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">de baja</span>
          )}
          {tagsDelAlumno.map((t) => (
            <span
              key={t.tagId}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${t.color}22`, color: t.color }}
            >
              {t.nombre}
            </span>
          ))}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {modalidadLabel[alumno.modalidad]}
          {alumno.email ? ` · ${alumno.email}` : ''}
          {alumno.telefono ? ` · ${alumno.telefono}` : ''}
          {alumno.nivel ? ` · Nivel: ${alumno.nivel}` : ''}
        </div>
        {alumno.notas && (
          <div className="text-xs text-zinc-400 mt-1 italic truncate">{alumno.notas}</div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={onEditar}
          className="text-xs rounded border px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
        >
          Editar
        </button>
        {alumno.estado === 'activo' ? (
          <button
            onClick={darBaja}
            disabled={working}
            className="text-xs rounded border px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Dar de baja
          </button>
        ) : (
          <button
            onClick={reactivar}
            disabled={working}
            className="text-xs rounded border px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            Reactivar
          </button>
        )}
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
        await crearAlumno(tenantId, {
          nombre: nombre.trim(),
          email: email.trim() || undefined,
          telefono: telefono.trim() || undefined,
          nivel: nivel.trim() || undefined,
          modalidad,
          notas: notas.trim() || undefined,
          tagsIds,
          createdBy,
        });
        setFeedback({ type: 'ok', msg: `${nombre} se ha añadido correctamente.` });
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !puedeEnviar}
          className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
        >
          {submitting ? 'Guardando…' : modo === 'crear' ? 'Añadir alumno' : 'Guardar cambios'}
        </button>
        {modo === 'editar' && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-zinc-600 hover:text-zinc-900"
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Editar alumno</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Gestionar tags</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleCrear} className="flex items-end gap-2 mb-5">
          <Field label="Nuevo tag">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full"
              placeholder="Ej. Competición"
            />
          </Field>
          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 mb-1">Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 border rounded"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !nombre.trim()}
            className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-3 py-2 text-sm"
          >
            Crear
          </button>
        </form>

        {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2 mb-3">{error}</div>}

        {tags.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes tags creados todavía.</p>
        ) : (
          <ul className="space-y-2">
            {tags.map((t) => (
              <li key={t.tagId} className="flex items-center justify-between border rounded px-3 py-2">
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}
                >
                  {t.nombre}
                </span>
                <button
                  onClick={() => handleBorrar(t.tagId)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
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
