'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * /[tenantSlug]/chat
 * -----------------------------------------------------------------------
 * Página pública — no requiere login. Cualquier persona (potencial
 * alumno, alumno existente) puede preguntar al asistente sobre el
 * negocio del profesor: precios, horarios, niveles, ubicación, etc.
 * El profesor configura la info desde /[tenantSlug]/asistente/config.
 * -----------------------------------------------------------------------
 */

type InfoPublica = {
  nombreNegocio: string;
  nombreProfesor: string;
  descripcion: string;
  ubicacion: string;
  telefono: string;
  email: string;
  niveles: string[];
  horarios: { dia: string; horas: string }[];
  precioBono: string;
  precioSuelta: string;
  infoExtra: string;
};

type Mensaje = {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
};

const SUGERENCIAS_PUBLICO = [
  '¿Cuánto cuesta una clase?',
  '¿Qué niveles tienes?',
  '¿Dónde estáis?',
  '¿Cómo me apunto?',
  '¿Tenéis clases para principiantes?',
  '¿Cuál es el horario?',
];

export default function ChatPublicoPage() {
  const params = useParams<{ tenantSlug: string }>();
  const [info, setInfo] = useState<InfoPublica | null>(null);
  const [loading, setLoading] = useState(true);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Cargar info pública del tenant
    getDocs(query(collection(db, 'tenants'), where('slug', '==', params.tenantSlug)))
      .then(async (snap) => {
        if (snap.empty) { setLoading(false); return; }
        const tenantId = snap.docs[0].data().tenantId as string;
        const infoSnap = await getDocs(collection(db, 'tenants', tenantId, 'infoPublica'));
        if (!infoSnap.empty) {
          const datos = infoSnap.docs[0].data() as InfoPublica;
          setInfo(datos);
          setMensajes([{
            id: 'bienvenida',
            rol: 'assistant',
            texto: `¡Hola! Soy el asistente de **${datos.nombreNegocio}**. Puedo contarte todo sobre las clases, precios, horarios y niveles. ¿En qué te puedo ayudar?`,
          }]);
        } else {
          setMensajes([{
            id: 'bienvenida',
            rol: 'assistant',
            texto: '¡Hola! Soy el asistente de esta academia. ¿En qué te puedo ayudar?',
          }]);
        }
        setLoading(false);
      });
  }, [params.tenantSlug]);

  const contexto = info ? `Eres el asistente virtual de ${info.nombreNegocio}, academia de pádel dirigida por ${info.nombreProfesor}.

INFORMACIÓN DEL NEGOCIO:
- Nombre: ${info.nombreNegocio}
- Profesor: ${info.nombreProfesor}
- Ubicación: ${info.ubicacion || 'No especificada'}
- Teléfono: ${info.telefono || 'No especificado'}
- Email: ${info.email || 'No especificado'}
- Descripción: ${info.descripcion || 'Academia de pádel'}

NIVELES DISPONIBLES: ${info.niveles?.join(', ') || 'Todos los niveles'}

HORARIOS:
${info.horarios?.map((h) => `- ${h.dia}: ${h.horas}`).join('\n') || 'Consultar disponibilidad'}

PRECIOS:
- Bono mensual: ${info.precioBono || 'Consultar'}
- Clase suelta: ${info.precioSuelta || 'Consultar'}

INFORMACIÓN ADICIONAL:
${info.infoExtra || ''}

Responde de forma amable, concisa y en español. Si te preguntan algo que no sabes, invita a contactar directamente por teléfono o email. Si alguien quiere apuntarse, diles que contacten al profesor. NO inventes información que no esté en los datos proporcionados.` : '';

  async function enviar(texto: string) {
    if (!texto.trim() || enviando) return;
    setInput('');

    const msgUser: Mensaje = { id: Date.now().toString(), rol: 'user', texto: texto.trim() };
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
          max_tokens: 500,
          system: contexto,
          messages: [...historial, { role: 'user', content: texto.trim() }],
        }),
      });

      const data = await res.json();
      const respuesta = data.content?.find((b: any) => b.type === 'text')?.text || 'No pude responder. Contacta directamente con el profesor.';

      setMensajes((prev) => [...prev, { id: (Date.now() + 1).toString(), rol: 'assistant', texto: respuesta }]);
    } catch {
      setMensajes((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        texto: 'Hubo un error. Por favor contacta directamente con el profesor.',
      }]);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#09090F' }}>
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
            <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE640"/>
          </svg>
          <span className="text-sm" style={{ color: '#F4EFE650' }}>Cargando…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#09090F' }}>
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid #ffffff10' }}>
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
          <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
          <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
          <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
          <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
        </svg>
        <div>
          <p className="text-base font-bold" style={{ color: '#F4EFE6' }}>
            {info?.nombreNegocio || 'Academia de Pádel'}
          </p>
          <p className="text-xs" style={{ color: '#F4EFE650' }}>
            Asistente virtual · {info?.nombreProfesor || ''}
          </p>
        </div>
        <span
          className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"
          style={{ background: '#16a34a20', color: '#16a34a' }}
        >
          ● En línea
        </span>
      </header>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.rol === 'assistant' && (
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mr-2 mt-0.5"
                style={{ background: '#E8A020' }}
              >
                <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                  <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#09090F"/>
                  <rect x="16" y="5" width="5" height="18" rx="1" fill="#09090F"/>
                </svg>
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              style={
                m.rol === 'user'
                  ? { background: '#E8A020', color: '#09090F', fontWeight: 500, borderBottomRightRadius: '4px' }
                  : { background: '#ffffff10', color: '#F4EFE6', borderBottomLeftRadius: '4px', border: '1px solid #ffffff10' }
              }
            >
              {m.texto}
            </div>
          </div>
        ))}
        {enviando && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mr-2"
              style={{ background: '#E8A020' }}
            >
              <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#09090F"/>
              </svg>
            </div>
            <div
              className="rounded-2xl px-4 py-2.5 text-sm animate-pulse"
              style={{ background: '#ffffff10', color: '#F4EFE650' }}
            >
              Escribiendo…
            </div>
          </div>
        )}
      </div>

      {/* Sugerencias */}
      {mensajes.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {SUGERENCIAS_PUBLICO.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ background: '#ffffff08', color: '#F4EFE680', border: '1px solid #ffffff10' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-6 pt-2 shrink-0">
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-2"
          style={{ background: '#ffffff08', border: '1px solid #E8A02040' }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar(input)}
            placeholder="Escribe tu pregunta…"
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: '#F4EFE6' }}
            disabled={enviando}
          />
          <button
            onClick={() => enviar(input)}
            disabled={!input.trim() || enviando}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40"
            style={{ background: '#E8A020' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#09090F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: '#F4EFE625' }}>
          Voltek by Kronorix · Asistente de {info?.nombreNegocio || 'esta academia'}
        </p>
      </div>
    </div>
  );
}
