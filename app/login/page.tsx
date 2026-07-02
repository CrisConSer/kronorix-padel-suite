'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSessionUser, homeRouteFor } from '@/src/useSessionUser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { user, loading } = useSessionUser();

  if (!loading && user) {
    router.replace(homeRouteFor(user));
    return <CargandoSesion />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError('Email o contraseña incorrectos.');
      } else {
        setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#09090F' }}
    >
      {/* Patrón de fondo sutil */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, #E8A02008 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, #E8A02005 0%, transparent 40%)`,
        }}
      />

      <div className="w-full max-w-sm relative z-10">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-3 mb-4">
            {/* Símbolo VK */}
            <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
              <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
              <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
              <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
              <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
            </svg>
            <div className="flex flex-col leading-none">
              <span
                className="font-black text-[28px] tracking-tight"
                style={{ color: '#F4EFE6', letterSpacing: '-0.5px' }}
              >
                VOLTEK
              </span>
              <span
                className="text-[10px] font-medium tracking-widest"
                style={{ color: '#E8A02060', letterSpacing: '2px' }}
              >
                by KRONORIX
              </span>
            </div>
          </div>
          <p className="text-sm text-center" style={{ color: '#F4EFE640' }}>
            Gestión inteligente para profesores de pádel
          </p>
        </div>

        {/* Card del formulario */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid #ffffff10' }}
        >
          {/* Cabecera de la card */}
          <div
            className="px-6 py-4"
            style={{ background: '#ffffff07', borderBottom: '1px solid #ffffff08' }}
          >
            <h2 className="text-base font-bold" style={{ color: '#F4EFE6' }}>
              Accede a tu cuenta
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#F4EFE640' }}>
              Introduce tus credenciales para continuar
            </p>
          </div>

          {/* Formulario */}
          <form
            onSubmit={handleSubmit}
            className="px-6 py-6 space-y-4"
            style={{ background: '#ffffff04' }}
          >
            <label className="block">
              <span
                className="block text-[11px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: '#F4EFE650' }}
              >
                Email
              </span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: '#ffffff08',
                  border: '1px solid #ffffff12',
                  color: '#F4EFE6',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid #E8A02060';
                  e.target.style.background = '#ffffff10';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid #ffffff12';
                  e.target.style.background = '#ffffff08';
                }}
              />
            </label>

            <label className="block">
              <span
                className="block text-[11px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: '#F4EFE650' }}
              >
                Contraseña
              </span>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: '#ffffff08',
                  border: '1px solid #ffffff12',
                  color: '#F4EFE6',
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid #E8A02060';
                  e.target.style.background = '#ffffff10';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid #ffffff12';
                  e.target.style.background = '#ffffff08';
                }}
              />
            </label>

            {error && (
              <div
                className="text-sm rounded-xl px-4 py-3"
                style={{ background: '#C0481015', color: '#C04810', border: '1px solid #C0481030' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-60 mt-2"
              style={{ background: '#E8A020', color: '#09090F' }}
            >
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: '#F4EFE625' }}>
          Automatiza · Optimiza · Crece
        </p>
      </div>
    </div>
  );
}

function CargandoSesion() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#09090F' }}
    >
      <div className="flex items-center gap-3">
        <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
          <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
          <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE640"/>
          <polygon points="21,5 27,5 21,14" fill="#F4EFE640"/>
          <polygon points="21,14 27,23 21,23" fill="#F4EFE640"/>
        </svg>
        <p className="text-sm" style={{ color: '#F4EFE650' }}>Cargando tu sesión…</p>
      </div>
    </div>
  );
}
