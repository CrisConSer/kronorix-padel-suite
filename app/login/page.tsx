'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSessionUser, homeRouteFor } from '@/src/useSessionUser';

/**
 * /login
 * -----------------------------------------------------------------------
 * Login genérico para los 3 roles (super_admin, admin, alumno). Tras
 * autenticar, useSessionUser() resuelve quién es la persona y a qué
 * tenant pertenece; este componente solo espera a que esa resolución
 * termine y redirige con homeRouteFor().
 * -----------------------------------------------------------------------
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { user, loading } = useSessionUser();

  // Si ya hay sesión resuelta (ej. recargaste /login estando logueada),
  // redirige directamente sin pedir credenciales otra vez.
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
      // No redirigimos aquí a mano: el cambio de auth state hace que
      // useSessionUser() se actualice solo, y el render de arriba
      // (if (!loading && user)) se encarga de la redirección.
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Email o contraseña incorrectos.');
      } else {
        setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-amber-500 tracking-wide">KRONORIX</h1>
          <p className="text-xs text-zinc-400 mt-1">Automatiza · Optimiza · Crece</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg p-6 space-y-4 shadow-xl"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Iniciar sesión</h2>

          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 mb-1">Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="tu@email.com"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 mb-1">Contraseña</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CargandoSesion() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <p className="text-sm text-zinc-400">Cargando tu sesión…</p>
    </div>
  );
}
