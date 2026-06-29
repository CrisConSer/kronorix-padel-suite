'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSessionUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== 'super_admin') {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Verificando acceso…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-950 text-white px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-bold text-amber-500 shrink-0">KRONORIX</span>
          <span className="text-xs text-zinc-400 shrink-0">Panel super admin</span>
        </div>
        <div className="flex items-center gap-3 text-sm shrink-0">
          <span className="text-zinc-300 hidden sm:inline truncate max-w-[160px]">
            {user.displayName || user.email}
          </span>
          <button
            onClick={() => signOut(auth)}
            className="text-zinc-300 hover:text-white underline shrink-0"
          >
            Salir
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
