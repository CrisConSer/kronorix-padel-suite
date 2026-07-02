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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#09090F' }}>
        <p className="text-sm" style={{ color: '#F4EFE660' }}>Verificando acceso…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#F4EFE6' }}>
      <header
        className="px-4 sm:px-6 py-3 flex items-center justify-between gap-2 sticky top-0 z-40"
        style={{ background: '#09090F' }}
      >
        <div className="flex items-center gap-3">
          {/* Símbolo VK */}
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
            <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
            <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
            <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
          </svg>
          <div className="flex flex-col leading-none">
            <span className="font-black text-[15px] tracking-tight" style={{ color: '#F4EFE6', letterSpacing: '-0.3px' }}>
              VOLTEK
            </span>
            <span className="text-[9px] font-medium tracking-widest" style={{ color: '#E8A02070', letterSpacing: '1.5px' }}>
              by KRONORIX
            </span>
          </div>
          <span className="w-px h-5 opacity-20 shrink-0" style={{ background: '#F4EFE6' }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#F4EFE650' }}>
            Super Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs hidden sm:block truncate max-w-[160px]" style={{ color: '#F4EFE670' }}>
            {user.displayName || user.email}
          </span>
          <button
            onClick={() => signOut(auth)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#F4EFE6', background: '#ffffff15' }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Nav interno */}
      <div style={{ background: '#09090F', borderBottom: '1px solid #ffffff10' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 pb-0">
          {[
            { href: '/superadmin', label: 'Inicio' },
            { href: '/superadmin/profesores', label: 'Profesores' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-xs font-semibold px-3 py-2.5 border-b-2 transition-colors"
              style={{
                color: '#F4EFE6',
                borderBottomColor: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = '#E8A020')}
              onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}
