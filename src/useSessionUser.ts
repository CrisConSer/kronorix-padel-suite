'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { SessionUser, UserDoc, TenantDoc } from './types';

/**
 * useSessionUser
 * -----------------------------------------------------------------------
 * Sustituye al patrón actual de page.tsx (lecturas sueltas a 'admins',
 * 'profile'/'profiles', 'users'). Aquí todo sale de UNA sola lectura a
 * /users/{uid}, y si el usuario es admin o alumno, se resuelve también
 * el slug de su tenant (necesario para construir las rutas /[slug]/...).
 *
 * Devuelve null mientras carga, y `undefined`... no: devuelve siempre
 * un objeto con `loading` para que el consumidor no tenga que adivinar.
 * -----------------------------------------------------------------------
 */

type UseSessionUserResult = {
  loading: boolean;
  user: SessionUser | null; // null = no autenticado o doc inexistente
  error: string | null;
};

export function useSessionUser(): UseSessionUserResult {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));

        if (!userSnap.exists()) {
          // Autenticado en Firebase Auth pero sin doc de perfil: no debería
          // pasar en flujo normal (el alta siempre crea ambos a la vez),
          // pero lo tratamos como "sin acceso" en vez de romper la app.
          setUser(null);
          setError('No se encontró un perfil asociado a esta cuenta.');
          setLoading(false);
          return;
        }

        const data = userSnap.data() as UserDoc;

        if (!data.active) {
          setUser(null);
          setError('Tu cuenta está desactivada. Contacta con tu profesor o con Kronorix.');
          setLoading(false);
          return;
        }

        let tenantSlug: string | null = null;
        if (data.tenantId) {
          const tenantSnap = await getDoc(doc(db, 'tenants', data.tenantId));
          if (tenantSnap.exists()) {
            tenantSlug = (tenantSnap.data() as TenantDoc).slug;
          }
        }

        setUser({
          uid: firebaseUser.uid,
          email: data.email || firebaseUser.email || '',
          displayName: data.displayName || firebaseUser.email || 'Usuario/a',
          role: data.role,
          tenantId: data.tenantId,
          tenantSlug,
          alumnoId: data.alumnoId,
          active: data.active,
        });
      } catch (e) {
        console.error('Error resolviendo sesión:', e);
        setUser(null);
        setError('Error cargando el perfil. Inténtalo de nuevo.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { loading, user, error };
}

/**
 * Helper de redirección post-login. Se usa en /login tras un signIn exitoso,
 * o en el layout raíz para mandar a cada rol a su home.
 */
export function homeRouteFor(user: SessionUser): string {
  if (user.role === 'super_admin') return '/superadmin';
  if (user.role === 'admin' && user.tenantSlug) return `/${user.tenantSlug}`;
  if (user.role === 'alumno' && user.tenantSlug) return `/${user.tenantSlug}/mi-cuenta`;
  return '/login';
}
