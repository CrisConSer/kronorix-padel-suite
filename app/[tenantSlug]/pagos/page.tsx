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
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-6">
      <header>
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>Pagos</h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>Bonos mensuales y clases sueltas.</p>
      </header>

      {/* ── BONOS ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>Alumnos con bono</h2>
          {alumnosBono.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#09090F', color: '#E8A020' }}>
              {alumnosBono.length}
            </span>
          )}
        </div>
        {loadingDatos ? (
          <p className="text-sm" style={{ color: '#a1a1aa' }}>Cargando…</p>
        ) : alumnosBono.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center">
            <p className="text-sm" style={{ color: '#a1a1aa' }}>No tienes alumnos con modalidad bono.</p>
          </div>
        ) : (
          <ul className="space-y-2">
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

      {/* ── SUELTAS ── */}
      {alumnosSuelta.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>Clase suelta</h2>
          </div>
          <ul className="space-y-2">
            {alumnosSuelta.map((a) => (
              <li
                key={a.alumnoId}
                className="rounded-2xl flex items-center justify-between gap-3 px-4 py-3 bg-white"
                style={{ border: '1.5px solid #e4e4e7' }}
              >
                <span className="font-semibold text-sm" style={{ color: '#09090F' }}>{a.nombre}</span>
                <button
                  onClick={() => setAlumnoParaPago(a)}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 transition-colors"
                  style={{ background: '#09090F', color: '#E8A020' }}
                >
                  Registrar pago
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── HISTORIAL ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>Historial de pagos</h2>
          {pagos.length > 0 && (
            <span className="text-[11px]" style={{ color: '#a1a1aa' }}>Últimos {Math.min(pagos.length, 30)}</span>
          )}
        </div>
        {pagos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 py-8 text-center">
            <p className="text-sm" style={{ color: '#a1a1aa' }}>Todavía no hay pagos registrados.</p>
          </div>
        ) : (
          <ul
            className="rounded-2xl overflow-hidden"
            style={{ border: '1.5px solid #e4e4e7' }}
          >
            {pagos.slice(0, 30).map((p, i) => (
              <PagoRow
                key={p.pagoId}
                pago={p}
                nombreAlumno={alumnosPorId.get(p.alumnoId)?.nombre || 'Alumno'}
                onEditar={() => setPagoParaEditar(p)}
                onBorrar={() => handleBorrarPago(p)}
                esUltimo={i === Math.min(pagos.length, 30) - 1}
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
      <li
        className="rounded-2xl flex items-center justify-between gap-3 px-4 py-3"
        style={{ border: '1.5px dashed #e4e4e7', background: '#fafafa' }}
      >
        <div>
          <span className="font-semibold text-sm" style={{ color: '#09090F' }}>{alumno.nombre}</span>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>Sin bono activo</p>
        </div>
        <button
          onClick={onCrearBono}
          className="text-xs font-bold px-3 py-1.5 rounded-xl shrink-0"
          style={{ background: '#09090F', color: '#E8A020' }}
        >
          Crear bono
        </button>
      </li>
    );
  }

  const estado = estadoEfectivoBono(bono);
  const restantes = clasesRestantes(bono);
  const pct = bono.clasesContratadas > 0
    ? Math.round((bono.clasesConsumidas / bono.clasesContratadas) * 100)
    : 0;

  const fechaInicioStr = bono.fechaInicio.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const fechaFinStr = bono.fechaFin.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  const badgeStyle =
    estado === 'activo'
      ? { background: '#09090F', color: '#E8A020' }
      : estado === 'agotado'
      ? { background: '#E8A02015', color: '#92400e' }
      : { background: '#C0481015', color: '#C04810' };

  const barColor = estado !== 'activo' ? '#C04810' : restantes <= 1 ? '#E8A020' : '#16a34a';

  return (
    <li
      className="rounded-2xl overflow-hidden"
      style={{ border: `1.5px solid ${estado === 'activo' ? '#e4e4e7' : estado === 'agotado' ? '#E8A02040' : '#C0481030'}` }}
    >
      <div className="flex items-center gap-0">
        {/* Barra lateral de estado */}
        <div className="w-1 self-stretch shrink-0" style={{ background: barColor }} />

        <div className="flex flex-1 flex-col gap-2 px-4 py-3 bg-white min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm" style={{ color: '#09090F' }}>{alumno.nombre}</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                style={badgeStyle}
              >
                {estado === 'activo' ? 'Activo' : estado === 'agotado' ? 'Agotado' : 'Caducado'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onEditarBono(bono)}
                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
                style={{ color: '#353542' }}
              >
                Editar
              </button>
              {(estado === 'agotado' || estado === 'caducado') && (
                <button
                  onClick={onCrearBono}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
                  style={{ background: '#09090F', color: '#E8A020' }}
                >
                  Renovar
                </button>
              )}
            </div>
          </div>

          {/* Barra de progreso */}
          <div>
            <div className="flex justify-between text-[11px] mb-1" style={{ color: '#a1a1aa' }}>
              <span>{bono.clasesConsumidas}/{bono.clasesContratadas} clases · <strong style={{ color: '#09090F' }}>{restantes} restantes</strong></span>
              <span>{bono.precio.toFixed(2)} €</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#a1a1aa' }}>
              {fechaInicioStr} – {fechaFinStr}
            </p>
          </div>
        </div>
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

  const modalStyle = { background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' };
  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto flex flex-col" style={modalStyle}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: '#09090F' }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#E8A02080' }}>Nuevo bono</p>
            <h2 className="text-base font-bold text-white">{alumno.nombre}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 text-lg">×</button>
        </div>
        <div className="px-5 py-5">
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Fecha inicio">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Fecha fin">
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
            className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors" style={{ background: '#09090F', color: '#E8A020' }}
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
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full sm:max-w-sm max-h-[92vh] overflow-y-auto flex flex-col" style={{ background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: '#09090F' }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#E8A02080' }}>Registrar pago</p>
            <h2 className="text-base font-bold text-white">{alumno.nombre}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 text-lg">×</button>
        </div>
        <div className="px-5 py-5">

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
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPago)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
            className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors" style={{ background: '#09090F', color: '#E8A020' }}
          >
            {submitting ? 'Guardando…' : 'Registrar pago'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

function PagoRow({
  pago,
  nombreAlumno,
  onEditar,
  onBorrar,
  esUltimo,
}: {
  pago: PagoDoc;
  nombreAlumno: string;
  onEditar: () => void;
  onBorrar: () => void;
  esUltimo?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const fechaStr = pago.fecha?.toDate
    ? pago.fecha.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })
    : '';

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transf.',
    bizum: 'Bizum',
    otro: 'Otro',
  };

  return (
    <li
      className="flex items-center justify-between gap-2 px-4 py-3 bg-white flex-wrap"
      style={{ borderBottom: esUltimo ? 'none' : '1px solid #f4f4f5' }}
    >
      <div className="min-w-0 flex items-center gap-3">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: pago.tipo === 'bono' ? '#E8A020' : '#09090F' }}
        />
        <div className="min-w-0">
          <span className="text-sm font-semibold" style={{ color: '#09090F' }}>{nombreAlumno}</span>
          <span className="text-xs ml-2" style={{ color: '#a1a1aa' }}>
            {pago.tipo === 'bono' ? 'Bono' : 'Suelta'} · {metodoLabel[pago.metodo] || pago.metodo}
            {fechaStr ? ` · ${fechaStr}` : ''}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold" style={{ color: '#09090F' }}>{pago.importe.toFixed(2)} €</span>
        {!confirmando ? (
          <>
            {pago.tipo === 'suelta' && (
              <button
                onClick={onEditar}
                className="text-xs px-2 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
                style={{ color: '#353542' }}
              >
                Editar
              </button>
            )}
            <button
              onClick={() => setConfirmando(true)}
              className="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-red-50"
              style={{ color: '#C04810' }}
            >
              Borrar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmando(false)}
              className="text-xs px-2 py-1 rounded-lg border border-zinc-200"
              style={{ color: '#71717a' }}
            >
              No
            </button>
            <button
              onClick={() => { setConfirmando(false); onBorrar(); }}
              className="text-xs px-2 py-1 rounded-lg font-semibold"
              style={{ background: '#C04810', color: 'white' }}
            >
              Sí, borrar
            </button>
          </>
        )}
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

  const modalStyle = { background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' };
  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto flex flex-col" style={modalStyle}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: '#09090F' }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#E8A02080' }}>Editar bono</p>
            <h2 className="text-base font-bold text-white">{alumnoNombre}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 text-lg">×</button>
        </div>
        <div className="px-5 py-5">
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
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
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Fecha inicio">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Fecha fin">
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
              />
            </Field>
          </div>

          <p className="text-xs text-zinc-500">
            El estado (Activo / Agotado / Caducado) se recalcula automáticamente a partir
            de estos valores al guardar.
          </p>

          {error && <div className="text-sm rounded-xl px-4 py-3 mb-1" style={{ background: '#C0481015', color: '#C04810' }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors" style={{ background: '#09090F', color: '#E8A020' }}
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
        </div>
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
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" style={{ backgroundColor: 'rgba(9,9,15,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full sm:max-w-sm max-h-[92vh] overflow-y-auto flex flex-col" style={{ background: '#F4EFE6', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(9,9,15,0.18)' }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: '#09090F' }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#E8A02080' }}>Editar pago</p>
            <h2 className="text-base font-bold text-white">{alumnoNombre}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 text-lg">×</button>
        </div>
        <div className="px-5 py-5">

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
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
            />
          </Field>
          <Field label="Método de pago">
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPago)}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-zinc-400"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="bizum">Bizum</option>
              <option value="otro">Otro</option>
            </select>
          </Field>

          {error && <div className="text-sm rounded-xl px-4 py-3 mb-1" style={{ background: '#C0481015', color: '#C04810' }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors" style={{ background: '#09090F', color: '#E8A020' }}
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
        </div>
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
