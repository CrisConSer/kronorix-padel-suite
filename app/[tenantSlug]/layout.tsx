'use client';

import { signOut } from 'firebase/auth';
import { useParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useTenantGuard } from '@/src/useTenantGuard';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const { loading, allowed, mode, user } = useTenantGuard(tenantSlug);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Verificando acceso…</p>
      </div>
    );
  }

  if (!allowed || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-sm text-red-600">No tienes acceso a este espacio.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-950 text-white px-6 py-3 flex items-center justify-between">
        <div>
          <span className="font-bold text-amber-500">KRONORIX</span>
          <span className="text-xs text-zinc-400 ml-2">/{tenantSlug}</span>
          {mode === 'readonly-support' && (
            <span className="text-xs bg-amber-900 text-amber-200 px-2 py-0.5 rounded ml-2">
              modo soporte (solo lectura, sin datos de alumnos)
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-300">{user.displayName || user.email}</span>
          <button onClick={() => signOut(auth)} className="text-zinc-300 hover:text-white underline">
            Salir
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
