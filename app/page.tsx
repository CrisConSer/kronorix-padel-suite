'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionUser, homeRouteFor } from '@/src/useSessionUser';

/**
 * / (raíz)
 * -----------------------------------------------------------------------
 * No tiene contenido propio: solo decide a dónde mandar a la persona
 * según si tiene sesión y qué rol tiene.
 * -----------------------------------------------------------------------
 */
export default function HomePage() {
  const { user, loading } = useSessionUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else {
      router.replace(homeRouteFor(user));
    }
  }, [loading, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <p className="text-sm text-zinc-400">Cargando…</p>
    </div>
  );
}
