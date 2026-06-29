export default function SuperAdminHomePage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-zinc-900">Bienvenido, super admin</h1>
      <p className="text-sm text-zinc-600 mt-2">
        Esto confirma que el login y la resolución de rol funcionan. Aquí
        irá el resumen de profesores — de momento, ve a{' '}
        <a href="/superadmin/profesores" className="text-amber-600 underline">
          /superadmin/profesores
        </a>{' '}
        para el alta de profesores.
      </p>
    </div>
  );
}
