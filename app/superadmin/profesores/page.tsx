'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
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
    <div className="max-w-3xl mx-auto p-3 sm:p-6 space-y-6">
      <header className="pt-2">
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>Profesores</h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
          Alta y gestión de cuentas. No se muestran datos de alumnos ni pagos.
        </p>
      </header>

      {/* Formulario nuevo profesor */}
      <NuevoProfesorForm />

      {/* Listado */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Listado
          </h2>
          {tenants.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#09090F', color: '#E8A020' }}>
              {tenants.length}
            </span>
          )}
        </div>
        {loadingTenants ? (
          <p className="text-sm" style={{ color: '#a1a1aa' }}>Cargando profesores…</p>
        ) : tenants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-10 text-center">
            <p className="text-sm" style={{ color: '#a1a1aa' }}>Todavía no hay profesores de alta.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tenants.map((t) => (
              <TenantRow key={t.tenantId} tenant={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TenantRow({ tenant: t }: { tenant: TenantDoc }) {
  const [working, setWorking] = useState(false);
  const [confirmando, setConfirmando] = useState<'suspender' | null>(null);

  async function cambiarPlan(nuevoPlan: 'trial' | 'activo' | 'suspendido') {
    setWorking(true);
    try {
      await updateDoc(doc(db, 'tenants', t.tenantId), {
        plan: nuevoPlan,
        active: nuevoPlan !== 'suspendido',
      });
    } catch (e) {
      console.error('Error cambiando plan:', e);
    } finally {
      setWorking(false);
      setConfirmando(null);
    }
  }

  const planStyle =
    t.plan === 'activo'
      ? { background: '#09090F', color: '#E8A020' }
      : t.plan === 'trial'
      ? { background: '#E8A02018', color: '#92400e' }
      : { background: '#f4f4f5', color: '#71717a' };

  const barColor = !t.active ? '#e4e4e7' : t.plan === 'activo' ? '#16a34a' : '#E8A020';

  return (
    <li
      className="rounded-2xl overflow-hidden"
      style={{ border: '1.5px solid #e4e4e7', opacity: !t.active ? 0.6 : 1 }}
    >
      <div className="flex items-stretch">
        <div className="w-1 shrink-0" style={{ background: barColor }} />
        <div className="flex flex-1 flex-col bg-white min-w-0">
          {/* Fila principal */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm" style={{ color: '#09090F' }}>
                  {t.nombreNegocio}
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={planStyle}
                >
                  {t.plan}{!t.active ? ' · inactivo' : ''}
                </span>
              </div>
              <div className="text-xs mt-0.5 flex flex-wrap gap-1.5" style={{ color: '#a1a1aa' }}>
                <span>{t.nombreProfesor}</span>
                <span>·</span>
                <span className="font-mono">/{t.slug}</span>
                <span>·</span>
                <span>{t.email}</span>
              </div>
            </div>
            <a
              href={`/${t.slug}/calendario`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors shrink-0"
              style={{ color: '#353542' }}
            >
              Ver app ↗
            </a>
          </div>

          {/* Barra de acciones de plan */}
          <div
            className="flex items-center gap-2 px-4 py-2 flex-wrap"
            style={{ borderTop: '1px solid #f4f4f5' }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest mr-1" style={{ color: '#a1a1aa' }}>
              Plan:
            </span>

            {/* Botón Trial */}
            <button
              onClick={() => cambiarPlan('trial')}
              disabled={working || t.plan === 'trial'}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all disabled:opacity-40"
              style={
                t.plan === 'trial'
                  ? { background: '#E8A020', color: '#09090F' }
                  : { background: '#f4f4f5', color: '#71717a' }
              }
            >
              Trial
            </button>

            {/* Botón Activo */}
            <button
              onClick={() => cambiarPlan('activo')}
              disabled={working || t.plan === 'activo'}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-all disabled:opacity-40"
              style={
                t.plan === 'activo'
                  ? { background: '#09090F', color: '#E8A020' }
                  : { background: '#f4f4f5', color: '#71717a' }
              }
            >
              ✓ Activo
            </button>

            {/* Botón Suspender con confirmación */}
            <div className="ml-auto flex items-center gap-2">
              {confirmando === 'suspender' ? (
                <>
                  <span className="text-[11px]" style={{ color: '#71717a' }}>¿Suspender acceso?</span>
                  <button
                    onClick={() => setConfirmando(null)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-zinc-200"
                    style={{ color: '#71717a' }}
                  >
                    No
                  </button>
                  <button
                    onClick={() => cambiarPlan('suspendido')}
                    disabled={working}
                    className="text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                    style={{ background: '#C04810', color: 'white' }}
                  >
                    Sí, suspender
                  </button>
                </>
              ) : (
                <button
                  onClick={() => !t.active ? cambiarPlan('trial') : setConfirmando('suspender')}
                  disabled={working}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  style={
                    !t.active
                      ? { background: '#09090F', color: '#E8A020' }
                      : { background: '#fee2e2', color: '#C04810' }
                  }
                >
                  {!t.active ? '↩ Reactivar' : 'Suspender'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function NuevoProfesorForm() {
  const [abierto, setAbierto] = useState(false);
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
        msg: `Profesor creado (/${result.slug}). Email enviado a ${email}.`,
      });
      setNombreProfesor('');
      setNombreNegocio('');
      setEmail('');
      setTelefono('');
      setSlug('');
      setSlugEditadoManualmente(false);
      setAbierto(false);
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e?.message || 'No se pudo crear el profesor.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {feedback && (
        <div
          className="text-sm rounded-xl px-4 py-3 mb-3"
          style={
            feedback.type === 'ok'
              ? { background: '#09090F', color: '#E8A020' }
              : { background: '#C0481015', color: '#C04810' }
          }
        >
          {feedback.msg}
        </div>
      )}

      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{ border: abierto ? '1.5px solid #09090F' : '1.5px dashed #E8A02070', background: abierto ? 'white' : '#F4EFE6' }}
      >
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
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
            {abierto ? 'Cerrar formulario' : 'Añadir nuevo profesor'}
          </span>
        </button>

        {abierto && (
          <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 border-t border-zinc-100 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre del profesor">
                <input
                  required
                  value={nombreProfesor}
                  onChange={(e) => setNombreProfesor(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                  placeholder="Pablo Miki"
                />
              </Field>
              <Field label="Nombre del negocio">
                <input
                  required
                  value={nombreNegocio}
                  onChange={(e) => handleNombreNegocioChange(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                  placeholder="Pablo Miki Padel"
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                  placeholder="pablo@ejemplo.com"
                />
              </Field>
              <Field label="Teléfono (opcional)">
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none"
                  placeholder="600 000 000"
                />
              </Field>
              <Field label="Slug (URL)" hint={slug ? `kronorix.app/${slug}` : undefined}>
                <input
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugEditadoManualmente(true);
                    setSlug(slugify(e.target.value));
                  }}
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none font-mono"
                  placeholder="pablomiki"
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors"
              style={{ background: '#09090F', color: '#E8A020' }}
            >
              {submitting ? 'Creando…' : 'Crear profesor'}
            </button>
          </form>
        )}
      </div>
    </div>
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
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#353542' }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-xs mt-1 font-mono" style={{ color: '#a1a1aa' }}>
          {hint}
        </span>
      )}
    </label>
  );
}
