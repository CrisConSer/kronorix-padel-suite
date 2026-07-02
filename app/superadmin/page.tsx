'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { TenantDoc } from '@/src/types';

export default function SuperAdminHomePage() {
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

  const stats = useMemo(() => {
    const activos = tenants.filter((t) => t.active && t.plan === 'activo').length;
    const trial = tenants.filter((t) => t.active && t.plan === 'trial').length;
    const inactivos = tenants.filter((t) => !t.active).length;
    const total = tenants.length;
    return { activos, trial, inactivos, total };
  }, [tenants]);

  if (loadingUser) return (
    <div className="p-6 text-sm" style={{ color: '#a1a1aa' }}>Cargando…</div>
  );

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6">
      <header className="pt-2">
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>
          Cuadro de mando
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
          Estado de la plataforma en tiempo real.
        </p>
      </header>

      {/* ── MÉTRICAS ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricaCard titulo="Total profesores" valor={stats.total} icono="👥" acento="#09090F" />
        <MetricaCard titulo="Plan activo" valor={stats.activos} icono="✅" acento="#16a34a" />
        <MetricaCard titulo="En trial" valor={stats.trial} icono="⏳" acento="#E8A020" />
        <MetricaCard titulo="Inactivos" valor={stats.inactivos} icono="⚠️" acento="#C04810" />
      </section>

      {/* ── ESTADO DE TENANTS ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Estado de profesores
          </h2>
          <a
            href="/superadmin/profesores"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
            style={{ background: '#09090F', color: '#E8A020' }}
          >
            + Nuevo profesor
          </a>
        </div>

        {loadingTenants ? (
          <p className="text-sm" style={{ color: '#a1a1aa' }}>Cargando…</p>
        ) : tenants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center">
            <p className="text-sm" style={{ color: '#a1a1aa' }}>No hay profesores de alta todavía.</p>
            <a
              href="/superadmin/profesores"
              className="inline-block mt-3 text-xs font-bold px-4 py-2 rounded-xl"
              style={{ background: '#09090F', color: '#E8A020' }}
            >
              Crear el primero
            </a>
          </div>
        ) : (
          <ul className="space-y-2">
            {tenants.map((t) => (
              <TenantRow key={t.tenantId} tenant={t} />
            ))}
          </ul>
        )}
      </section>

      {/* ── CHECKS DE SISTEMA ── */}
      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#353542' }}>
          Checks del sistema
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <CheckCard
            titulo="Firestore"
            ok={!loadingTenants}
            descripcion={loadingTenants ? 'Comprobando conexión…' : 'Conexión activa'}
          />
          <CheckCard
            titulo="Tenants cargados"
            ok={tenants.length >= 0 && !loadingTenants}
            descripcion={loadingTenants ? 'Cargando…' : `${tenants.length} tenant${tenants.length !== 1 ? 's' : ''} en BD`}
          />
          <CheckCard
            titulo="Profesores activos"
            ok={stats.activos > 0 || stats.trial > 0}
            descripcion={
              stats.activos + stats.trial === 0
                ? 'Ningún profesor operativo'
                : `${stats.activos + stats.trial} operativo${stats.activos + stats.trial !== 1 ? 's' : ''}`
            }
          />
        </div>
      </section>
    </div>
  );
}

function TenantRow({ tenant: t }: { tenant: TenantDoc }) {
  const planStyle =
    t.plan === 'activo'
      ? { background: '#09090F', color: '#E8A020' }
      : t.plan === 'trial'
      ? { background: '#E8A02018', color: '#92400e' }
      : { background: '#f4f4f5', color: '#71717a' };

  return (
    <li
      className="rounded-2xl overflow-hidden"
      style={{
        border: `1.5px solid ${!t.active ? '#e4e4e7' : t.plan === 'activo' ? '#e4e4e7' : '#E8A02040'}`,
        opacity: !t.active ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-0">
        {/* Indicador lateral */}
        <div
          className="w-1 self-stretch shrink-0"
          style={{
            background: !t.active ? '#e4e4e7' : t.plan === 'activo' ? '#16a34a' : '#E8A020',
          }}
        />
        <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3 bg-white flex-wrap">
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
            <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#a1a1aa' }}>
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
      </div>
    </li>
  );
}

function MetricaCard({
  titulo,
  valor,
  icono,
  acento,
}: {
  titulo: string;
  valor: number;
  icono: string;
  acento: string;
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
        <span className="text-base">{icono}</span>
      </div>
      <div className="text-3xl font-black leading-none" style={{ color: acento }}>
        {valor}
      </div>
    </div>
  );
}

function CheckCard({
  titulo,
  ok,
  descripcion,
}: {
  titulo: string;
  ok: boolean;
  descripcion: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{
        background: ok ? '#09090F' : '#fef2f2',
        border: `1.5px solid ${ok ? '#09090F' : '#fca5a5'}`,
      }}
    >
      <span className="text-lg shrink-0 mt-0.5">{ok ? '✅' : '❌'}</span>
      <div>
        <p className="text-xs font-bold" style={{ color: ok ? '#E8A020' : '#991b1b' }}>
          {titulo}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: ok ? '#F4EFE670' : '#b91c1c' }}>
          {descripcion}
        </p>
      </div>
    </div>
  );
}
