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
      <header className="bg-zinc-950 text-white sticky top-0 z-40">
        <div className="px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <Link href={`/${tenantSlug}`} className="font-bold text-amber-500 shrink-0">
              KRONORIX
            </Link>
            <span className="text-xs text-zinc-400 shrink-0">/{tenantSlug}</span>
            {mode === 'readonly-support' && (
              <span className="text-xs bg-amber-900 text-amber-200 px-2 py-0.5 rounded">
                modo soporte
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <span className="text-zinc-300 hidden sm:inline truncate max-w-[160px]">
              {user.displayName || user.email}
            </span>
            <button onClick={() => signOut(auth)} className="text-zinc-300 hover:text-white underline shrink-0">
              Salir
            </button>
            {secciones.length > 0 && (
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="sm:hidden text-zinc-300 hover:text-white shrink-0"
                aria-label="Abrir menú"
              >
                {menuAbierto ? '✕' : '☰'}
              </button>
            )}
          </div>
        </div>

        {secciones.length > 0 && (
          <>
            {/* Navegación horizontal en escritorio/tablet */}
            <nav className="hidden sm:flex px-3 sm:px-6 gap-1 border-t border-zinc-800 overflow-x-auto">
              {secciones.map((s) => {
                const href = `/${tenantSlug}${s.href}`;
                const activa = esSeccionActiva(s.href);
                return (
                  <Link
                    key={s.href}
                    href={href}
                    className={[
                      'px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors',
                      activa
                        ? 'border-amber-500 text-amber-400 font-medium'
                        : 'border-transparent text-zinc-400 hover:text-white',
                    ].join(' ')}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </nav>

            {/* Menú desplegable en móvil */}
            {menuAbierto && (
              <nav className="sm:hidden border-t border-zinc-800 px-3 py-2 flex flex-col gap-1">
                {secciones.map((s) => {
                  const href = `/${tenantSlug}${s.href}`;
                  const activa = esSeccionActiva(s.href);
                  return (
                    <Link
                      key={s.href}
                      href={href}
                      onClick={() => setMenuAbierto(false)}
                      className={[
                        'px-3 py-2 text-sm rounded',
                        activa ? 'bg-zinc-800 text-amber-400 font-medium' : 'text-zinc-300',
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
