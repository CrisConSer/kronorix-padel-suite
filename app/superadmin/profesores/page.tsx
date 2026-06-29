'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { crearProfesorYEnviarInvitacion, slugify } from '@/src/crearProfesorClient';
import type { TenantDoc } from '@/src/types';
import { useSessionUser } from '@/src/useSessionUser';

/**
 * /superadmin/profesores
 * -----------------------------------------------------------------------
 * El super admin SOLO ve aquí: nombre, negocio, slug, plan y estado
 * (activo/suspendido) de cada profesor. Nunca alumnos, pagos ni notas
 * — por diseño, ver docs/02-rutas-y-roles.md.
 * -----------------------------------------------------------------------
 */
export default function ProfesoresPage() {
  const { user, loading: loadingUser } = useSessionUser();
  const [tenants, setTenants] = useState<TenantDoc[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'super_admin') return;
    const q = query(collection(db, 'tenants'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setTenants(snap.docs.map((d) => d.data() as TenantDoc));
      setLoadingTenants(false);
    });
    return () => unsub();
  }, [user]);

  if (loadingUser) return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  if (!user || user.role !== 'super_admin') {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Profesores</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Alta y gestión de cuentas de profesor. No se muestran alumnos, pagos ni
          notas de ningún tenant.
        </p>
      </header>

      <NuevoProfesorForm />

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Listado</h2>
        {loadingTenants ? (
          <p className="text-sm text-zinc-500">Cargando profesores…</p>
        ) : tenants.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay profesores de alta.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
            {tenants.map((t) => (
              <li key={t.tenantId} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900 truncate">{t.nombreNegocio}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {t.nombreProfesor} · /{t.slug} · {t.email}
                  </div>
                </div>
                <span
                  className={[
                    'text-xs px-2 py-1 rounded-full font-medium shrink-0',
                    t.plan === 'activo'
                      ? 'bg-emerald-50 text-emerald-700'
                      : t.plan === 'trial'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-zinc-100 text-zinc-600',
                  ].join(' ')}
                >
                  {t.plan}
                  {!t.active ? ' · inactivo' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NuevoProfesorForm() {
  const [nombreProfesor, setNombreProfesor] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);

  function handleNombreNegocioChange(value: string) {
    setNombreNegocio(value);
    if (!slugEditadoManualmente) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await crearProfesorYEnviarInvitacion({
        nombreProfesor,
        nombreNegocio,
        email,
        telefono: telefono || undefined,
        slug,
      });

      setFeedback({
        type: 'ok',
        msg: `Profesor creado (/${result.slug}). Se ha enviado un email a ${email} para que establezca su contraseña.`,
      });
      setNombreProfesor('');
      setNombreNegocio('');
      setEmail('');
      setTelefono('');
      setSlug('');
      setSlugEditadoManualmente(false);
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e?.message || 'No se pudo crear el profesor.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-200 rounded p-5 space-y-4 bg-white"
    >
      <h2 className="text-lg font-semibold text-zinc-900">Nuevo profesor</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre del profesor">
          <input
            required
            value={nombreProfesor}
            onChange={(e) => setNombreProfesor(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Pablo Miki"
          />
        </Field>

        <Field label="Nombre del negocio">
          <input
            required
            value={nombreNegocio}
            onChange={(e) => handleNombreNegocioChange(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Pablo Miki Padel"
          />
        </Field>

        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="pablo@ejemplo.com"
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

        <Field label="Slug (URL)" hint={slug ? `kronorixpadel.com/${slug}` : undefined}>
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlugEditadoManualmente(true);
              setSlug(slugify(e.target.value));
            }}
            className="w-full border rounded px-3 py-2 text-sm font-mono"
            placeholder="pablomiki"
          />
        </Field>
      </div>

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

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
      >
        {submitting ? 'Creando…' : 'Crear profesor'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-400 mt-1">{hint}</span>}
    </label>
  );
}
