'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSessionUser } from '@/src/useSessionUser';
import type { AlumnoDoc, BonoDoc, PagoDoc, MetodoPago } from '@/src/types';
import {
  crearBono,
  actualizarBono,
  registrarPagoSuelto,
  editarPagoSuelto,
  borrarPago,
  estadoEfectivoBono,
  clasesRestantes,
} from '@/src/pagosClient';

/**
 * /[tenantSlug]/pagos
 * -----------------------------------------------------------------------
 * Dos bloques: alumnos con modalidad 'bono' (estado del bono actual,
 * clases restantes, botón para crear/renovar) y registro rápido de
 * pagos sueltos para alumnos con modalidad 'suelta'. Además, un
 * historial de pagos reciente para ambos casos.
 * -----------------------------------------------------------------------
 */
export default function PagosPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { user, loading: loadingUser } = useSessionUser();
  const tenantId = user?.tenantId;

  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [bonos, setBonos] = useState<BonoDoc[]>([]);
  const [pagos, setPagos] = useState<PagoDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  const [alumnoParaBono, setAlumnoParaBono] = useState<AlumnoDoc | null>(null);
  const [alumnoParaPago, setAlumnoParaPago] = useState<AlumnoDoc | null>(null);
  const [bonoParaEditar, setBonoParaEditar] = useState<BonoDoc | null>(null);
  const [pagoParaEditar, setPagoParaEditar] = useState<PagoDoc | null>(null);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(
      collection(db, 'tenants', tenantId, 'alumnos'),
      where('estado', '==', 'activo'),
      orderBy('nombre')
    );
    const unsub = onSnapshot(q, (snap) => {
      setAlumnos(snap.docs.map((d) => d.data() as AlumnoDoc));
      setLoadingDatos(false);
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'bonos'), (snap) => {
      setBonos(snap.docs.map((d) => d.data() as BonoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  useEffect(() => {
    if (!tenantId || user?.role !== 'admin') return;
    const q = query(collection(db, 'tenants', tenantId, 'pagos'), orderBy('fecha', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPagos(snap.docs.map((d) => d.data() as PagoDoc));
    });
    return () => unsub();
  }, [tenantId, user?.role]);

  const bonosPorAlumno = useMemo(() => {
    const map = new Map<string, BonoDoc>();
    bonos.forEach((b) => {
      // Nos quedamos con el bono más reciente por alumno (createdAt).
      const actual = map.get(b.alumnoId);
      if (!actual || b.createdAt.toMillis() > actual.createdAt.toMillis()) {
        map.set(b.alumnoId, b);
      }
    });
    return map;
  }, [bonos]);

  const alumnosPorId = useMemo(() => {
    const map = new Map<string, AlumnoDoc>();
    alumnos.forEach((a) => map.set(a.alumnoId, a));
    return map;
  }, [alumnos]);

  const alumnosBono = alumnos.filter((a) => a.modalidad === 'bono');
  const alumnosSuelta = alumnos.filter((a) => a.modalidad === 'suelta');

  async function handleBorrarPago(pago: PagoDoc) {
    const mensaje =
      pago.tipo === 'bono'
        ? '¿Borrar este pago? Esto también eliminará el bono asociado y quitará el bono activo del alumno si era ese.'
        : '¿Borrar este pago suelto?';
    if (!confirm(mensaje)) return;
    try {
      await borrarPago(tenantId!, pago.pagoId);
    } catch (e) {
      console.error('Error borrando pago:', e);
      alert('No se pudo borrar el pago.');
    }
  }

  if (loadingUser) return <div className="p-6 text-sm text-zinc-500">Cargando…</div>;
  if (!user || user.role !== 'admin' || user.tenantSlug !== params.tenantSlug) {
    return <div className="p-6 text-sm text-red-600">No tienes acceso a esta página.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Pagos</h1>
        <p className="text-sm text-zinc-600 mt-1">Bonos mensuales y clases sueltas.</p>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Alumnos con bono</h2>
        {loadingDatos ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : alumnosBono.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes alumnos con modalidad bono.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {alumnosBono.map((a) => {
              const bono = bonosPorAlumno.get(a.alumnoId);
              return (
                <BonoRow
                  key={a.alumnoId}
                  alumno={a}
                  bono={bono}
                  onCrearBono={() => setAlumnoParaBono(a)}
                  onEditarBono={(b) => setBonoParaEditar(b)}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Alumnos con clase suelta</h2>
        {alumnosSuelta.length === 0 ? (
          <p className="text-sm text-zinc-500">No tienes alumnos con modalidad suelta.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {alumnosSuelta.map((a) => (
              <li key={a.alumnoId} className="p-4 flex items-center justify-between gap-4">
                <span className="font-medium text-zinc-900">{a.nombre}</span>
                <button
                  onClick={() => setAlumnoParaPago(a)}
                  className="text-xs rounded bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium px-3 py-1.5"
                >
                  Registrar pago
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Historial de pagos</h2>
        {pagos.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {pagos.slice(0, 30).map((p) => (
              <PagoRow
                key={p.pagoId}
                pago={p}
                nombreAlumno={alumnosPorId.get(p.alumnoId)?.nombre || 'Alumno'}
                onEditar={() => setPagoParaEditar(p)}
                onBorrar={() => handleBorrarPago(p)}
              />
            ))}
          </ul>
        )}
      </section>

      {alumnoParaBono && (
        <CrearBonoModal
          tenantId={tenantId!}
          alumno={alumnoParaBono}
          createdBy={user.uid}
          onClose={() => setAlumnoParaBono(null)}
        />
      )}

      {alumnoParaPago && (
        <RegistrarPagoModal
          tenantId={tenantId!}
          alumno={alumnoParaPago}
          registradoPor={user.uid}
          onClose={() => setAlumnoParaPago(null)}
        />
      )}

      {bonoParaEditar && (
        <EditarBonoModal
          tenantId={tenantId!}
          bono={bonoParaEditar}
          alumnoNombre={alumnosPorId.get(bonoParaEditar.alumnoId)?.nombre || 'Alumno'}
          onClose={() => setBonoParaEditar(null)}
        />
      )}

      {pagoParaEditar && (
        <EditarPagoModal
          tenantId={tenantId!}
          pago={pagoParaEditar}
          alumnoNombre={alumnosPorId.get(pagoParaEditar.alumnoId)?.nombre || 'Alumno'}
          onClose={() => setPagoParaEditar(null)}
        />
      )}
    </div>
  );
}

function BonoRow({
  alumno,
  bono,
  onCrearBono,
  onEditarBono,
}: {
  alumno: AlumnoDoc;
  bono?: BonoDoc;
  onCrearBono: () => void;
  onEditarBono: (bono: BonoDoc) => void;
}) {
  if (!bono) {
    return (
      <li className="p-4 flex items-center justify-between gap-4">
        <span className="font-medium text-zinc-900">{alumno.nombre}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Sin bono activo</span>
          <button
            onClick={onCrearBono}
            className="text-xs rounded bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium px-3 py-1.5"
          >
            Crear bono
          </button>
        </div>
      </li>
    );
  }

  const estado = estadoEfectivoBono(bono);
  const restantes = clasesRestantes(bono);

  const badgeClass =
    estado === 'activo'
      ? 'bg-emerald-50 text-emerald-700'
      : estado === 'agotado'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-red-50 text-red-700';

  const badgeLabel = estado === 'activo' ? 'Activo' : estado === 'agotado' ? 'Agotado' : 'Caducado';

  const fechaInicioStr = bono.fechaInicio.toDate().toLocaleDateString('es-ES');
  const fechaFinStr = bono.fechaFin.toDate().toLocaleDateString('es-ES');

  return (
    <li className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <span className="font-medium text-zinc-900">{alumno.nombre}</span>
        <div className="text-xs text-zinc-500 mt-0.5">
          {bono.clasesConsumidas}/{bono.clasesContratadas} clases usadas · {restantes} restantes ·{' '}
          {bono.precio.toFixed(2)} €
        </div>
        <div className="text-xs text-zinc-400 mt-0.5">
          {fechaInicioStr} – {fechaFinStr}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <span className={['text-xs px-2 py-0.5 rounded-full font-medium', badgeClass].join(' ')}>
          {badgeLabel}
        </span>
        <button
          onClick={() => onEditarBono(bono)}
          className="text-xs rounded border px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
        >
          Editar
        </button>
        {(estado === 'agotado' || estado === 'caducado') && (
          <button
            onClick={onCrearBono}
            className="text-xs rounded bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium px-3 py-1.5"
          >
            Renovar
          </button>
        )}
      </div>
    </li>
  );
}

function CrearBonoModal({
  tenantId,
  alumno,
  createdBy,
  onClose,
}: {
  tenantId: string;
  alumno: AlumnoDoc;
  createdBy: string;
  onClose: () => void;
}) {
  const hoy = new Date();
  const enUnMes = new Date(hoy);
  enUnMes.setMonth(enUnMes.getMonth() + 1);

  const [clasesContratadas, setClasesContratadas] = useState('8');
  const [precio, setPrecio] = useState('80');
  const [fechaInicio, setFechaInicio] = useState(hoy.toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(enUnMes.toISOString().slice(0, 10));
  const [registrarPagoAhora, setRegistrarPagoAhora] = useState(true);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await crearBono(tenantId, {
        alumnoId: alumno.alumnoId,
        clasesContratadas: Math.max(1, parseInt(clasesContratadas) || 0),
        precio: Math.max(0, parseFloat(precio) || 0),
        fechaInicio,
        fechaFin,
        createdBy,
        registrarPagoAhora,
        metodoPago: registrarPagoAhora ? metodoPago : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo crear el bono.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Nuevo bono · {alumno.nombre}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Clases contratadas">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={clasesContratadas}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setClasesContratadas(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Precio (€)">
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={precio}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fecha inicio">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fecha fin">
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={registrarPagoAhora}
              onChange={(e) => setRegistrarPagoAhora(e.target.checked)}
              className="rounded"
            />
            El alumno ya ha pagado este bono
          </label>

          {registrarPagoAhora && (
            <Field label="Método de pago">
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="bizum">Bizum</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
          )}

          {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
          >
            {submitting ? 'Creando…' : 'Crear bono'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RegistrarPagoModal({
  tenantId,
  alumno,
  registradoPor,
  onClose,
}: {
  tenantId: string;
  alumno: AlumnoDoc;
  registradoPor: string;
  onClose: () => void;
}) {
  const [importe, setImporte] = useState('20');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await registrarPagoSuelto(tenantId, {
        alumnoId: alumno.alumnoId,
        importe: Math.max(0, parseFloat(importe) || 0),
        metodo,
        registradoPor,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el pago.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Registrar pago · {alumno.nombre}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Importe (€)">
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={importe}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setImporte(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPago)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="bizum">Bizum</option>
              <option value="otro">Otro</option>
            </select>
          </Field>

          {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
          >
            {submitting ? 'Guardando…' : 'Registrar pago'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PagoRow({
  pago,
  nombreAlumno,
  onEditar,
  onBorrar,
}: {
  pago: PagoDoc;
  nombreAlumno: string;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const fechaStr = pago.fecha?.toDate ? pago.fecha.toDate().toLocaleDateString('es-ES') : '';

  return (
    <li className="p-3 flex items-center justify-between text-sm gap-2 flex-wrap">
      <div className="min-w-0">
        <span className="font-medium text-zinc-900">{nombreAlumno}</span>
        <span className="text-zinc-500 ml-2 block sm:inline text-xs sm:text-sm">
          {pago.tipo === 'bono' ? 'Bono' : 'Clase suelta'} · {pago.metodo}
          {fechaStr ? ` · ${fechaStr}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-medium text-zinc-900">{pago.importe.toFixed(2)} €</span>
        {pago.tipo === 'suelta' && (
          <button onClick={onEditar} className="text-xs text-zinc-600 hover:underline">
            Editar
          </button>
        )}
        <button onClick={onBorrar} className="text-xs text-red-600 hover:underline">
          Borrar
        </button>
      </div>
    </li>
  );
}

function EditarBonoModal({
  tenantId,
  bono,
  alumnoNombre,
  onClose,
}: {
  tenantId: string;
  bono: BonoDoc;
  alumnoNombre: string;
  onClose: () => void;
}) {
  const [clasesContratadas, setClasesContratadas] = useState(String(bono.clasesContratadas));
  const [clasesConsumidas, setClasesConsumidas] = useState(String(bono.clasesConsumidas));
  const [precio, setPrecio] = useState(String(bono.precio));
  const [fechaInicio, setFechaInicio] = useState(bono.fechaInicio.toDate().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(bono.fechaFin.toDate().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await actualizarBono(tenantId, bono.bonoId, {
        clasesContratadas: Math.max(0, parseInt(clasesContratadas) || 0),
        clasesConsumidas: Math.max(0, parseInt(clasesConsumidas) || 0),
        precio: Math.max(0, parseFloat(precio) || 0),
        fechaInicio,
        fechaFin,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Editar bono · {alumnoNombre}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Clases contratadas">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={clasesContratadas}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setClasesContratadas(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Clases consumidas">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={clasesConsumidas}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setClasesConsumidas(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Precio (€)">
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={precio}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fecha inicio">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Fecha fin">
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <p className="text-xs text-zinc-500">
            El estado (Activo / Agotado / Caducado) se recalcula automáticamente a partir
            de estos valores al guardar.
          </p>

          {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditarPagoModal({
  tenantId,
  pago,
  alumnoNombre,
  onClose,
}: {
  tenantId: string;
  pago: PagoDoc;
  alumnoNombre: string;
  onClose: () => void;
}) {
  const [importe, setImporte] = useState(String(pago.importe));
  const [metodo, setMetodo] = useState<MetodoPago>(pago.metodo);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await editarPagoSuelto(tenantId, pago.pagoId, { importe: Math.max(0, parseFloat(importe) || 0), metodo });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Editar pago · {alumnoNombre}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Importe (€)">
            <input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={importe}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setImporte(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPago)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="bizum">Bizum</option>
              <option value="otro">Otro</option>
            </select>
          </Field>

          {error && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-zinc-950 font-medium px-4 py-2 text-sm"
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
