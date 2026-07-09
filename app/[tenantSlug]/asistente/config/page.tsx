'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTenantGuard } from '@/src/useTenantGuard';
import Script from 'next/script';

type Horario = { dia: string; horas: string };

type InfoPublica = {
  nombreNegocio: string;
  nombreProfesor: string;
  descripcion: string;
  ubicacion: string;
  telefono: string;
  email: string;
  niveles: string[];
  horarios: Horario[];
  precioBono: string;
  precioSuelta: string;
  infoExtra: string;
};

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const NIVELES_PRESET = ['Iniciación', 'Intermedio', 'Avanzado', 'Competición'];

export default function AsistenteConfigPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { loading: loadingUser, allowed, user } = useTenantGuard(params.tenantSlug);
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [docId, setDocId] = useState<string | undefined>(undefined);

  const [form, setForm] = useState<InfoPublica>({
    nombreNegocio: '',
    nombreProfesor: '',
    descripcion: '',
    ubicacion: '',
    telefono: '',
    email: '',
    niveles: [],
    horarios: [{ dia: 'Lunes', horas: '' }],
    precioBono: '',
    precioSuelta: '',
    infoExtra: '',
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qrGenerado, setQrGenerado] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  // Resolver tenantId
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { setTenantId(user.tenantId ?? undefined); return; }
    getDocs(query(collection(db, 'tenants'), where('slug', '==', params.tenantSlug)))
      .then((snap) => { if (!snap.empty) setTenantId(snap.docs[0].data().tenantId as string); });
  }, [user?.role, user?.tenantId, params.tenantSlug]);

  // Cargar info existente y prellenar con datos del tenant
  useEffect(() => {
    if (!tenantId) return;
    // Cargar datos del tenant para prellenar
    getDocs(query(collection(db, 'tenants'), where('tenantId', '==', tenantId)))
      .then((snap) => {
        if (!snap.empty) {
          const t = snap.docs[0].data();
          setForm((prev) => ({
            ...prev,
            nombreNegocio: prev.nombreNegocio || t.nombreNegocio || '',
            nombreProfesor: prev.nombreProfesor || t.nombreProfesor || '',
            telefono: prev.telefono || t.telefono || '',
            email: prev.email || t.email || '',
          }));
        }
      });

    // Cargar configuración guardada
    getDocs(collection(db, 'tenants', tenantId, 'infoPublica'))
      .then((snap) => {
        if (!snap.empty) {
          setDocId(snap.docs[0].id);
          const data = snap.docs[0].data() as InfoPublica;
          setForm(data);
        }
        setLoading(false);
      });
  }, [tenantId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    try {
      const id = docId || 'config';
      await setDoc(doc(db, 'tenants', tenantId, 'infoPublica', id), form);
      setDocId(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function toggleNivel(nivel: string) {
    setForm((prev) => ({
      ...prev,
      niveles: prev.niveles.includes(nivel)
        ? prev.niveles.filter((n) => n !== nivel)
        : [...prev.niveles, nivel],
    }));
  }

  function updateHorario(i: number, campo: keyof Horario, valor: string) {
    setForm((prev) => {
      const h = [...prev.horarios];
      h[i] = { ...h[i], [campo]: valor };
      return { ...prev, horarios: h };
    });
  }

  if (loadingUser || loading) return <div className="p-6 text-sm" style={{ color: '#a1a1aa' }}>Cargando…</div>;
  if (!allowed || !user || user.role !== 'admin') return <div className="p-6 text-sm text-red-600">No tienes acceso.</div>;

  const urlPublica = `${typeof window !== 'undefined' ? window.location.origin : 'https://voltek.app'}/${params.tenantSlug}/chat`;

  function generarQR() {
    if (typeof window === 'undefined') return;
    const QRCode = (window as any).QRCode;
    if (!QRCode || !qrContainerRef.current) return;
    qrContainerRef.current.innerHTML = '';
    new QRCode(qrContainerRef.current, {
      text: urlPublica,
      width: 200,
      height: 200,
      colorDark: '#09090F',
      colorLight: '#F4EFE6',
      correctLevel: QRCode.CorrectLevel.H,
    });
    setQrGenerado(true);
  }

  function descargarQR() {
    const img = qrContainerRef.current?.querySelector('img') as HTMLImageElement | null;
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `voltek-qr-${params.tenantSlug}.png`;
    a.click();
  }

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-6">
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" />
      <header>
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: '#09090F' }}>
          Asistente público
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
          Configura qué información puede compartir el asistente con potenciales alumnos.
        </p>
      </header>

      {/* URL pública + QR */}
      <div
        className="rounded-2xl p-4 space-y-4"
        style={{ background: '#09090F', border: '1.5px solid #09090F' }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: '#E8A02080' }}>
              URL del asistente público
            </p>
            <p className="text-sm font-mono" style={{ color: '#F4EFE6' }}>{urlPublica}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => navigator.clipboard.writeText(urlPublica)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
              style={{ background: '#E8A020', color: '#09090F' }}
            >
              Copiar enlace
            </button>
            <a
              href={urlPublica}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
              style={{ background: '#ffffff15', color: '#F4EFE6' }}
            >
              Ver ↗
            </a>
          </div>
        </div>

        {/* QR */}
        <div style={{ borderTop: '1px solid #ffffff10', paddingTop: '14px' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#E8A02080' }}>
            Código QR — imprime y pega en la pista
          </p>
          {!qrGenerado ? (
            <button
              onClick={generarQR}
              className="text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              style={{ background: '#ffffff15', color: '#F4EFE6' }}
            >
              Generar QR
            </button>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div
                ref={qrContainerRef}
                className="rounded-xl overflow-hidden"
                style={{ padding: '8px', background: '#F4EFE6' }}
              />
              <div className="space-y-2">
                <p className="text-xs" style={{ color: '#F4EFE670' }}>
                  Descarga el QR y pégalo en la pista, tarjetas de visita o tu Instagram.
                </p>
                <button
                  onClick={descargarQR}
                  className="text-xs font-semibold px-4 py-2 rounded-xl block"
                  style={{ background: '#E8A020', color: '#09090F' }}
                >
                  ↓ Descargar QR
                </button>
              </div>
            </div>
          )}
          {/* Contenedor oculto para cuando no está generado */}
          {!qrGenerado && <div ref={qrContainerRef} className="hidden" />}
        </div>
      </div>

      {/* Widget embebible */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Widget para tu web
          </h2>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: '#09090F', color: '#E8A020' }}
          >
            Nuevo
          </span>
        </div>
        <p className="text-xs" style={{ color: '#71717a' }}>
          Pega este código en tu web y aparecerá un botón flotante con el asistente.
        </p>
        <div
          className="rounded-xl p-3 font-mono text-xs overflow-x-auto"
          style={{ background: '#09090F', color: '#E8A020' }}
        >
          {`<script src="https://voltek.app/widget.js" data-slug="${params.tenantSlug}"></script>`}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(
            `<script src="https://voltek.app/widget.js" data-slug="${params.tenantSlug}"></script>`
          )}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
          style={{ background: '#09090F', color: '#E8A020' }}
        >
          Copiar código
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Info básica */}
        <section
          className="rounded-2xl p-5 space-y-4"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Información básica
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre del negocio">
              <input value={form.nombreNegocio} onChange={(e) => setForm({ ...form, nombreNegocio: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="Cris Pádel" />
            </Field>
            <Field label="Tu nombre">
              <input value={form.nombreProfesor} onChange={(e) => setForm({ ...form, nombreProfesor: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="Cristina" />
            </Field>
            <Field label="Teléfono de contacto">
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="600 000 000" />
            </Field>
            <Field label="Email de contacto">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="tu@email.com" />
            </Field>
            <Field label="Ubicación / dirección" className="sm:col-span-2">
              <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="Club de Pádel XYZ, Calle Mayor 1, Madrid" />
            </Field>
            <Field label="Descripción breve" className="sm:col-span-2">
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={2} className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                placeholder="Clases personalizadas de pádel para todos los niveles en un ambiente cercano y profesional." />
            </Field>
          </div>
        </section>

        {/* Niveles */}
        <section
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Niveles que impartes
          </h2>
          <div className="flex flex-wrap gap-2">
            {NIVELES_PRESET.map((n) => (
              <button
                key={n} type="button" onClick={() => toggleNivel(n)}
                className="text-sm px-3 py-1.5 rounded-full font-medium transition-all"
                style={
                  form.niveles.includes(n)
                    ? { background: '#09090F', color: '#E8A020' }
                    : { background: '#f4f4f5', color: '#71717a' }
                }
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* Precios */}
        <section
          className="rounded-2xl p-5 space-y-4"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>Precios</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Bono mensual (ej. 8 clases)">
              <input value={form.precioBono} onChange={(e) => setForm({ ...form, precioBono: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="80 €" />
            </Field>
            <Field label="Clase suelta">
              <input value={form.precioSuelta} onChange={(e) => setForm({ ...form, precioSuelta: e.target.value })}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="15 €" />
            </Field>
          </div>
        </section>

        {/* Horarios */}
        <section
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>Horarios</h2>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, horarios: [...prev.horarios, { dia: 'Lunes', horas: '' }] }))}
              className="text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{ background: '#09090F', color: '#E8A020' }}
            >
              + Añadir día
            </button>
          </div>
          <div className="space-y-2">
            {form.horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={h.dia}
                  onChange={(e) => updateHorario(i, 'dia', e.target.value)}
                  className="border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none"
                >
                  {DIAS.map((d) => <option key={d}>{d}</option>)}
                </select>
                <input
                  value={h.horas}
                  onChange={(e) => updateHorario(i, 'horas', e.target.value)}
                  placeholder="10:00 - 12:00, 17:00 - 20:00"
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none"
                />
                {form.horarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, horarios: prev.horarios.filter((_, j) => j !== i) }))}
                    className="text-sm text-zinc-400 hover:text-red-500 w-6 text-center"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Info extra */}
        <section
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#353542' }}>
            Información adicional
          </h2>
          <textarea
            value={form.infoExtra}
            onChange={(e) => setForm({ ...form, infoExtra: e.target.value })}
            rows={3}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
            placeholder="Cualquier otra cosa que quieras que el asistente pueda contar: política de cancelación, material necesario, aparcamiento, etc."
          />
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-bold px-6 py-2.5 rounded-xl disabled:opacity-60 transition-all"
            style={{ background: '#09090F', color: '#E8A020' }}
          >
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
          {saved && (
            <span className="text-sm font-medium" style={{ color: '#16a34a' }}>
              ✓ Guardado
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#353542' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
