'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { ClaseDoc } from '@/src/types';
import { hoyYmd, formatoFechaLarga } from '@/src/dateHelpers';

export default function TenantHomePage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user } = useSessionUser();
  const slug = params.tenantSlug;
  const tenantId = user?.tenantId;

  const [clasesHoy, setClasesHoy] = useState<ClaseDoc[]>([]);
  const [loadingClases, setLoadingClases] = useState(true);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const hoy = hoyYmd();
    const q = query(collection(db, 'tenants', tenantId, 'clases'), where('fecha', '==', hoy));
    const unsub = onSnapshot(q, (snap) => {
      const lista = (snap.docs.map((d) => d.data()) as ClaseDoc[])
        .filter((c) => c.estado === 'programada')
        .sort((a, b) => a.hora.localeCompare(b.hora));
      setClasesHoy(lista);
      setLoadingClases(false);
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  // Modo soporte (super admin): solo ve esto, sin enlaces a secciones
  // con datos de alumnos/pagos.
  if (user?.role === 'super_admin') {
    return (
      <div className="max-w-3xl mx-auto p-3 sm:p-6">
        <h1 className="text-2xl font-bold text-zinc-900">/{slug}</h1>
        <p className="text-sm text-zinc-600 mt-2">
          Estás viendo este tenant en modo soporte. No se muestran alumnos,
          pagos ni notas.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-[26px] font-bold text-zinc-900 tracking-tight capitalize">
          Hola{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 capitalize">{formatoFechaLarga(hoyYmd())}</p>
      </header>

      <section className="border border-zinc-200/80 rounded-xl bg-white p-5 shadow-sm shadow-zinc-200/50">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3.5">
          Hoy
        </h2>
        {loadingClases ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : clasesHoy.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes clases programadas para hoy.</p>
        ) : (
          <ul className="space-y-2.5">
            {clasesHoy.map((c) => (
              <li key={c.claseId} className="flex items-center justify-between text-sm gap-2 flex-wrap">
                <span className="font-medium text-zinc-900 tabular-nums">{c.hora}</span>
                <span className="text-zinc-500 text-[13px]">
                  {c.titulo || `${c.alumnosIds.length} alumno${c.alumnosIds.length === 1 ? '' : 's'}`}
                  {' · '}
                  {c.alumnosIds.length}/{c.capacidad}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/${slug}/calendario`}
          className="inline-flex items-center gap-1 mt-4 text-[13px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
        >
          Ver calendario completo
          <span aria-hidden>→</span>
        </Link>
      </section>
    </div>
  );
}
