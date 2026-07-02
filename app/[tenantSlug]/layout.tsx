'use client';

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { useTenantGuard } from '@/src/useTenantGuard';

const SECCIONES_ADMIN = [
  { href: '', label: 'Inicio' },
  { href: '/alumnos', label: 'Alumnos' },
  { href: '/calendario', label: 'Calendario' },
  { href: '/pagos', label: 'Pagos' },
  { href: '/dashboard', label: 'Cuadro de mando' },
];

const SECCIONES_ALUMNO = [{ href: '/mi-cuenta', label: 'Mi cuenta' }];

function VoltekLogo({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 shrink-0 group">
      {/* Símbolo VK */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        {/* V en ámbar */}
        <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
        {/* K barra vertical */}
        <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
        {/* K brazo superior */}
        <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
        {/* K brazo inferior */}
        <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
      </svg>
      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <span
          className="font-black tracking-tight text-[16px]"
          style={{ color: '#F4EFE6', fontFamily: 'sans-serif', letterSpacing: '-0.3px' }}
        >
          VOLTEK
        </span>
        <span
          className="text-[9px] font-medium tracking-widest"
          style={{ color: '#E8A02070', letterSpacing: '1.5px' }}
        >
          by KRONORIX
        </span>
      </div>
    </Link>
  );
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const pathname = usePathname();
  const { loading, allowed, mode, user } = useTenantGuard(tenantSlug);
  const [menuAbierto, setMenuAbierto] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#09090F' }}>
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
            <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE640"/>
            <polygon points="21,5 27,5 21,14" fill="#F4EFE640"/>
            <polygon points="21,14 27,23 21,23" fill="#F4EFE640"/>
          </svg>
          <p className="text-sm" style={{ color: '#F4EFE650' }}>Verificando acceso…</p>
        </div>
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

  const secciones =
    mode === 'admin' ? SECCIONES_ADMIN : mode === 'alumno' ? SECCIONES_ALUMNO : [];

  function esSeccionActiva(href: string): boolean {
    const ruta = `/${tenantSlug}${href}`;
    if (href === '') return pathname === ruta;
    return pathname.startsWith(ruta);
  }

  return (
    <div className="min-h-screen" style={{ background: '#F4EFE6' }}>
      <header className="sticky top-0 z-40" style={{ background: '#09090F' }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-3">
            <VoltekLogo href={`/${tenantSlug}`} />
            <span className="w-px h-5 shrink-0" style={{ background: '#ffffff15' }} />
            <span className="text-xs truncate font-mono" style={{ color: '#F4EFE640' }}>
              /{tenantSlug}
            </span>
            {mode === 'readonly-support' && (
              <span
                className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-widest"
                style={{ background: '#E8A02015', color: '#E8A020', border: '1px solid #E8A02030' }}
              >
                modo soporte
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs hidden sm:inline truncate max-w-[160px]" style={{ color: '#F4EFE650' }}>
              {user.displayName || user.email}
            </span>
            <button
              onClick={() => signOut(auth)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#F4EFE6', background: '#ffffff10' }}
            >
              Salir
            </button>
            {secciones.length > 0 && (
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="sm:hidden p-1.5 rounded-lg transition-colors"
                style={{ color: '#F4EFE6', background: '#ffffff10' }}
                aria-label="Abrir menú"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  {menuAbierto ? (
                    <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  ) : (
                    <path d="M3 6H17M3 10H17M3 14H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>

        {secciones.length > 0 && (
          <>
            <nav
              className="hidden sm:flex px-4 sm:px-6 gap-0.5 overflow-x-auto"
              style={{ borderTop: '1px solid #ffffff08' }}
            >
              {secciones.map((s) => {
                const href = `/${tenantSlug}${s.href}`;
                const activa = esSeccionActiva(s.href);
                return (
                  <Link
                    key={s.href}
                    href={href}
                    className="relative px-3.5 py-2.5 text-[13px] whitespace-nowrap transition-colors"
                    style={{ color: activa ? '#E8A020' : '#F4EFE660' }}
                  >
                    {s.label}
                    {activa && (
                      <span
                        className="absolute left-3.5 right-3.5 -bottom-px h-[2px] rounded-full"
                        style={{ background: '#E8A020' }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {menuAbierto && (
              <nav
                className="sm:hidden px-3 py-2 flex flex-col gap-0.5"
                style={{ borderTop: '1px solid #ffffff08', background: '#09090F' }}
              >
                {secciones.map((s) => {
                  const href = `/${tenantSlug}${s.href}`;
                  const activa = esSeccionActiva(s.href);
                  return (
                    <Link
                      key={s.href}
                      href={href}
                      onClick={() => setMenuAbierto(false)}
                      className="px-3 py-2.5 text-sm rounded-xl transition-colors"
                      style={{
                        background: activa ? '#E8A02015' : 'transparent',
                        color: activa ? '#E8A020' : '#F4EFE680',
                      }}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </>
        )}
      </header>
      {children}
    </div>
  );
}
