'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionUser } from './useSessionUser';
import type { SessionUser } from './types';

export type TenantGuardMode = 'admin' | 'alumno' | 'readonly-support';

type TenantGuardResult = {
  loading: boolean;
  allowed: boolean;
  mode: TenantGuardMode | null;
  user: SessionUser | null;
};

/**
 * useTenantGuard(tenantSlugFromUrl)
 * -----------------------------------------------------------------------
 * Envuelve cada página bajo /[tenantSlug]/... Decide si el usuario actual
 * puede ver esta página, y en qué modo (admin completo, alumno limitado,
 * o super admin en modo soporte de solo lectura sin acceso a datos de
 * alumnos — ver nota más abajo).
 *
 * IMPORTANTE: esto es defensa en profundidad para la UX (evitar que un
 * admin vea por error el calendario de otro profesor cambiando la URL a
 * mano). La seguridad REAL está en firestore.rules: aunque este guard
 * tuviera un bug, Firestore rechazaría las lecturas/escrituras igualmente
 * porque comparan el tenantId del propio usuario autenticado, nunca el
 * de la URL.
 * -----------------------------------------------------------------------
 */
export function useTenantGuard(tenantSlugFromUrl: string): TenantGuardResult {
  const { loading, user } = useSessionUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const isOwnTenant = user.tenantSlug === tenantSlugFromUrl;
    const isSuperAdmin = user.role === 'super_admin';

    if (!isOwnTenant && !isSuperAdmin) {
      // Intento de acceder al tenant de otro: fuera, sin explicar por qué
      // (no dar pistas de que el tenant existe o no).
      router.replace('/login');
    }
  }, [loading, user, tenantSlugFromUrl, router]);

  if (loading || !user) {
    return { loading, allowed: false, mode: null, user: null };
  }

  if (user.role === 'super_admin') {
    // El super admin SOLO entra en modo soporte: nunca ve listados de
    // alumnos, pagos ni notas. Las páginas deben comprobar `mode` y
    // ocultar/bloquear esas secciones cuando mode === 'readonly-support'.
    return { loading: false, allowed: true, mode: 'readonly-support', user };
  }

  if (user.role === 'admin' && user.tenantSlug === tenantSlugFromUrl) {
    return { loading: false, allowed: true, mode: 'admin', user };
  }

  if (user.role === 'alumno' && user.tenantSlug === tenantSlugFromUrl) {
    return { loading: false, allowed: true, mode: 'alumno', user };
  }

  return { loading: false, allowed: false, mode: null, user };
}
