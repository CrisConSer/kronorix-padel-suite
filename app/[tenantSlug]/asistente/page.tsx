'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTenantGuard } from '@/src/useTenantGuard';
import type { AlumnoDoc, BonoDoc, ClaseDoc, PagoDoc, TagDoc, TenantDoc } from '@/src/types';
import { estadoEfectivoBono, clasesRestantes } from '@/src/pagosClient';

function hoyYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type Mensaje = {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
  ts: number;
};

const SUGERENCIAS = [
  '¿Cuántos alumnos activos tengo?',
  '¿Qué alumnos tienen el bono agotado?',
  '¿Cuántas clases tengo esta semana?',
  '¿Quién lleva más de 2 semanas sin venir?',
  '¿Cuánto he ingresado este mes?',
  '¿Qué alumnos están en lista de espera?',
];

export default function AsistenteProfesorPage() {
  const params = useParams<{ tenantSlug: string }>();
  const { loading: loadingUser, allowed, user } = useTenantGuard(params.tenantSlug);

  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [tenant, setTenant] = useState<TenantDoc | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoDoc[]>([]);
  const [clases, setClases] = useState<ClaseDoc[]>([]);
  const [pagos, setPagos] = useState<PagoDoc[]>([]);
  const [bonos, setBonos] = useState<BonoDoc[]>([]);
  const [tags, setTags] = useState<TagDoc[]>([]);
  const [loadingDatos, setLoadingDatos] = useState(true);

  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      id: 'bienvenida',
      rol: 'assistant',
      texto: '¡Hola! Soy tu asistente Voltek. Tengo acceso a todos tus datos — alumnos, clases, pagos y bonos — y puedo ayudarte a entender tu negocio. ¿Qué quieres saber?',
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolver tenantId
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { setTenantId(user.tenantId ?? undefined); return; }
    getDocs(query(collection(db, 'tenants'), where('slug', '==', params.tenantSlug)))
      .then((snap) => { if (!snap.empty) setTenantId(snap.docs[0].data().tenantId as string); });
  }, [user?.role, user?.tenantId, params.tenantSlug]);

  // Cargar datos
  useEffect(() => {
    if (!tenantId) return;
    const unsubs: (() => void)[] = [];

    getDocs(query(collection(db, 'tenants'), where('tenantId', '==', tenantId)))
      .then((snap) => { if (!snap.empty) setTenant(snap.docs[0].data() as TenantDoc); });

    unsubs.push(onSnapshot(collection(db, 'tenants', tenantId, 'alumnos'), (s) =>
      setAlumnos(s.docs.map((d) => d.data() as AlumnoDoc))));
    unsubs.push(onSnapshot(collection(db, 'tenants', tenantId, 'bonos'), (s) =>
      setBonos(s.docs.map((d) => d.data() as BonoDoc))));
    unsubs.push(onSnapshot(collection(db, 'tenants', tenantId, 'pagos'), (s) =>
      setPagos(s.docs.map((d) => d.data() as PagoDoc))));
    unsubs.push(onSnapshot(collection(db, 'tenants', tenantId, 'tags'), (s) =>
      setTags(s.docs.map((d) => d.data() as TagDoc))));
    unsubs.push(onSnapshot(
      query(collection(db, 'tenants', tenantId, 'clases'), orderBy('fecha', 'desc')),
      (s) => { setClases(s.docs.map((d) => d.data() as ClaseDoc)); setLoadingDatos(false); }
    ));

    return () => unsubs.forEach((u) => u());
  }, [tenantId]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Construir contexto rico para Claude
  const contexto = useMemo(() => {
    if (loadingDatos) return '';
    const hoy = hoyYmd();
    const alumnosActivos = alumnos.filter((a) => a.estado === 'activo');
    const alumnosBaja = alumnos.filter((a) => a.estado === 'baja');

    // Clases
    const clasesProximas = clases.filter((c) => c.fecha >= hoy && c.estado === 'programada');
    const clasesPasadas = clases.filter((c) => c.fecha < hoy);
    const hoy7 = new Date(); hoy7.setDate(hoy7.getDate() + 7);
    const semanaStr = hoy7.toISOString().slice(0, 10);
    const clasesSemana = clasesProximas.filter((c) => c.fecha <= semanaStr);

    // Pagos del mes actual
    const ahora = new Date();
    const pagosMes = pagos.filter((p) => {
      if (!p.fecha?.toDate) return false;
      const d = p.fecha.toDate();
      return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
    });
    const ingresosMes = pagosMes.reduce((s, p) => s + p.importe, 0);

    // Bonos
    const bonosPorAlumno = new Map(bonos.map((b) => [b.alumnoId, b]));
    const bonosAgotados = alumnos.filter((a) => {
      const b = bonosPorAlumno.get(a.alumnoId);
      return b && estadoEfectivoBono(b) !== 'activo';
    });

    // Alumnos en riesgo (sin clase en 30 días)
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    const hace30Str = hace30.toISOString().slice(0, 10);
    const clases30 = clasesPasadas.filter((c) => c.fecha >= hace30Str);
    const alumnosRecientes = new Set(clases30.flatMap((c) => c.alumnosAsistieron));
    const enRiesgo = alumnosActivos.filter((a) => !alumnosRecientes.has(a.alumnoId));

    // Tags
    const tagMap = new Map(tags.map((t) => [t.tagId, t.nombre]));

    // Resumen de alumnos
    const resumenAlumnos = alumnosActivos.map((a) => {
      const bono = bonosPorAlumno.get(a.alumnoId);
      const tagsNombres = (a.tagsIds || []).map((id) => tagMap.get(id) || id).join(', ');
      return `- ${a.nombre} (${a.modalidad}${tagsNombres ? `, nivel: ${tagsNombres}` : ''}${bono ? `, bono: ${clasesRestantes(bono)} clases restantes, estado: ${estadoEfectivoBono(bono)}` : ', sin bono'})`;
    }).join('\n');

    // Próximas clases
    const resumenClases = clasesSemana.slice(0, 10).map((c) => {
      const nombres = c.alumnosIds.map((id) => alumnos.find((a) => a.alumnoId === id)?.nombre || id).join(', ');
      return `- ${c.fecha} ${c.hora} | ${c.titulo || 'Clase'} | Alumnos: ${nombres || 'Sin asignar'} | ${c.alumnosIds.length}/${c.capacidad} plazas`;
    }).join('\n');

    return `Eres el asistente inteligente de Voltek para el profesor ${tenant?.nombreProfesor || ''} de ${tenant?.nombreNegocio || ''}.

DATOS ACTUALES DEL NEGOCIO (${hoy}):

ALUMNOS:
- Activos: ${alumnosActivos.length}
- De baja: ${alumnosBaja.length}
- Total: ${alumnos.length}
- En riesgo de abandono (sin clase en 30 días): ${enRiesgo.map((a) => a.nombre).join(', ') || 'ninguno'}
- Con bono agotado o caducado: ${bonosAgotados.map((a) => a.nombre).join(', ') || 'ninguno'}

DETALLE DE ALUMNOS ACTIVOS:
${resumenAlumnos || 'Sin alumnos activos'}

CLASES PRÓXIMAS (esta semana):
${resumenClases || 'Sin clases próximas'}
- Total clases programadas: ${clasesProximas.length}

FINANZAS:
- Ingresos este mes: ${ingresosMes.toFixed(2)} €
- Total pagos registrados: ${pagos.length}

TAGS/NIVELES DISPONIBLES: ${tags.map((t) => t.nombre).join(', ') || 'ninguno'}

Responde de forma directa, concisa y útil. Usa los datos reales para responder preguntas concretas. Si el profesor pregunta algo que no está en los datos, dilo claramente. Responde siempre en español.`;
  }, [alumnos, clases, pagos, bonos, tags, tenant, loadingDatos]);

  async function enviar(texto: string) {
    if (!texto.trim() || enviando) return;
    setInput('');

    const msgUser: Mensaje = { id: Date.now().toString(), rol: 'user', texto: texto.trim(), ts: Date.now() };
    setMensajes((prev) => [...prev, msgUser]);
    setEnviando(true);

    try {
      const historial = mensajes
        .filter((m) => m.id !== 'bienvenida')
        .map((m) => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: contexto,
          messages: [...historial, { role: 'user', content: texto.trim() }],
        }),
      });

      const data = await res.json();
      const respuesta = data.content?.find((b: any) => b.type === 'text')?.text || 'No pude generar una respuesta.';

      setMensajes((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        texto: respuesta,
        ts: Date.now(),
      }]);
    } catch {
      setMensajes((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        texto: 'Hubo un error al conectar con el asistente. Inténtalo de nuevo.',
        ts: Date.now(),
      }]);
    } finally {
      setEnviando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  if (loadingUser) return <div className="p-6 text-sm" style={{ color: '#a1a1aa' }}>Cargando…</div>;
  if (!allowed || !user) return <div className="p-6 text-sm text-red-600">No tienes acceso.</div>;

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-6 flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: '#09090F' }}
        >
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
            <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
            <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
            <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
          </svg>
        </div>
        <div>
          <h1 className="text-base font-bold" style={{ color: '#09090F' }}>Asistente Voltek</h1>
          <p className="text-xs" style={{ color: '#a1a1aa' }}>
            {loadingDatos ? 'Cargando tus datos…' : `${alumnos.filter(a => a.estado === 'activo').length} alumnos · ${clases.filter(c => c.fecha >= hoyYmd()).length} clases próximas`}
          </p>
        </div>
        {!loadingDatos && (
          <span
            className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"
            style={{ background: '#16a34a15', color: '#16a34a' }}
          >
            ● En línea
          </span>
        )}
      </div>

      {/* Mensajes */}
      <div
        className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-3 mb-3"
        style={{ background: 'white', border: '1.5px solid #e4e4e7' }}
      >
        {mensajes.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.rol === 'assistant' && (
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5"
                style={{ background: '#09090F' }}
              >
                <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                  <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
                  <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
                  <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
                  <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
                </svg>
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={
                m.rol === 'user'
                  ? { background: '#09090F', color: '#F4EFE6', borderBottomRightRadius: '4px' }
                  : { background: '#F4EFE6', color: '#09090F', borderBottomLeftRadius: '4px', border: '1px solid #e4e4e7' }
              }
            >
              {m.texto}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5"
              style={{ background: '#09090F' }}
            >
              <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
                <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
              </svg>
            </div>
            <div
              className="rounded-2xl px-4 py-2.5 text-sm"
              style={{ background: '#F4EFE6', color: '#a1a1aa', borderBottomLeftRadius: '4px', border: '1px solid #e4e4e7' }}
            >
              <span className="animate-pulse">Pensando…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Sugerencias */}
      {mensajes.length <= 1 && (
        <div className="flex gap-2 flex-wrap mb-3 shrink-0">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-zinc-400"
              style={{ border: '1px solid #e4e4e7', color: '#353542', background: 'white' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-2 shrink-0"
        style={{ background: 'white', border: '1.5px solid #09090F' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar(input)}
          placeholder="Pregúntame sobre tus alumnos, clases o ingresos…"
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: '#09090F' }}
          disabled={enviando || loadingDatos}
        />
        <button
          onClick={() => enviar(input)}
          disabled={!input.trim() || enviando || loadingDatos}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
          style={{ background: '#E8A020' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#09090F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
