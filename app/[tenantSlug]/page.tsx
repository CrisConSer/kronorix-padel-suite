'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSessionUser } from '@/src/useSessionUser';

export default function TenantHomePage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user } = useSessionUser();
  const slug = params.tenantSlug;

  // Modo soporte (super admin): solo ve esto, sin enlaces a secciones
  // con datos de alumnos/pagos.
  if (user?.role === 'super_admin') {
    return (
      <div className="max-w-3xl mx-auto p-3 sm:p-6">
        <h1 className="text-2xl font-bold text-zinc-900">/{slug}</h1>
        <p className="text-sm text-zinc-600 mt-2">
          Estás viendo este tenant en modo soporte. No se muestran alumnos,
          pagos ni notas.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-6">
      <h1 className="text-2xl font-bold text-zinc-900">Panel de {slug}</h1>
      <p className="text-sm text-zinc-600 mt-2 mb-6">Gestión diaria de tu negocio.</p>

      <nav className="grid sm:grid-cols-2 gap-3">
        <NavCard href={`/${slug}/alumnos`} title="Alumnos" desc="Altas, bajas y fichas." disponible />
        <NavCard href={`/${slug}/calendario`} title="Calendario" desc="Clases, cupos y lista de espera." disponible />
        <NavCard href={`/${slug}/pagos`} title="Pagos" desc="Bonos y clases sueltas." disponible />
        <NavCard href={`/${slug}/dashboard`} title="Cuadro de mando" desc="Ocupación, ingresos, bajas." disponible />
      </nav>
    </div>
  );
}

function NavCard({
  href,
  title,
  desc,
  disponible = false,
}: {
  href: string;
  title: string;
  desc: string;
  disponible?: boolean;
}) {
  if (!disponible) {
    return (
      <div className="border border-zinc-200 rounded p-4 bg-zinc-50 opacity-60">
        <div className="font-medium text-zinc-700">{title}</div>
        <div className="text-xs text-zinc-500 mt-1">{desc}</div>
        <div className="text-xs text-zinc-400 mt-2">Próximamente</div>
      </div>
    );
  }
  return (
    <Link href={href} className="border border-zinc-200 rounded p-4 bg-white hover:border-amber-400 transition-colors">
      <div className="font-medium text-zinc-900">{title}</div>
      <div className="text-xs text-zinc-500 mt-1">{desc}</div>
    </Link>
  );
}
