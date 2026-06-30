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

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const pathname = usePathname();
  const { loading, allowed, mode, user } = useTenantGuard(tenantSlug);
  const [menuAbierto, setMenuAbierto] = useState(false);

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

  const secciones =
    mode === 'admin' ? SECCIONES_ADMIN : mode === 'alumno' ? SECCIONES_ALUMNO : [];

  function esSeccionActiva(href: string): boolean {
    const ruta = `/${tenantSlug}${href}`;
    if (href === '') return pathname === ruta;
    return pathname.startsWith(ruta);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-950 text-white sticky top-0 z-40 shadow-md shadow-black/20">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2.5">
            <Link
              href={`/${tenantSlug}`}
              className="font-bold text-amber-500 tracking-tight text-[15px] shrink-0"
            >
              KRONORIX
            </Link>
            <span className="w-px h-4 bg-zinc-700 shrink-0" />
            <span className="text-xs text-zinc-400 truncate">/{tenantSlug}</span>
            {mode === 'readonly-support' && (
              <span className="hidden sm:inline text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">
                modo soporte
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm shrink-0">
            <span className="text-zinc-400 hidden sm:inline truncate max-w-[160px]">
              {user.displayName || user.email}
            </span>
            <button
              onClick={() => signOut(auth)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Salir
            </button>
            {secciones.length > 0 && (
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="sm:hidden text-zinc-300 hover:text-white -mr-1 p-1"
                aria-label="Abrir menú"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
            {/* Navegación horizontal en escritorio/tablet */}
            <nav className="hidden sm:flex px-4 sm:px-6 gap-0.5 border-t border-white/[0.06] overflow-x-auto">
              {secciones.map((s) => {
                const href = `/${tenantSlug}${s.href}`;
                const activa = esSeccionActiva(s.href);
                return (
                  <Link
                    key={s.href}
                    href={href}
                    className={[
                      'relative px-3.5 py-2.5 text-[13px] whitespace-nowrap transition-colors',
                      activa ? 'text-amber-400 font-medium' : 'text-zinc-400 hover:text-zinc-100',
                    ].join(' ')}
                  >
                    {s.label}
                    {activa && (
                      <span className="absolute left-3.5 right-3.5 -bottom-px h-[2px] bg-amber-500 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Menú desplegable en móvil */}
            {menuAbierto && (
              <nav className="sm:hidden border-t border-white/[0.06] px-3 py-2 flex flex-col gap-0.5 bg-zinc-950">
                {secciones.map((s) => {
                  const href = `/${tenantSlug}${s.href}`;
                  const activa = esSeccionActiva(s.href);
                  return (
                    <Link
                      key={s.href}
                      href={href}
                      onClick={() => setMenuAbierto(false)}
                      className={[
                        'px-3 py-2.5 text-sm rounded-md transition-colors',
                        activa
                          ? 'bg-amber-500/10 text-amber-400 font-medium'
                          : 'text-zinc-300 hover:bg-white/5',
                      ].join(' ')}
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
