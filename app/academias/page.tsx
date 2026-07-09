'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TenantDoc } from '@/src/types';

type AcademiaPublica = {
  slug: string;
  nombreNegocio: string;
  nombreProfesor: string;
  niveles: string[];
  ubicacion: string;
  descripcion: string;
};

export default function AcademiasPage() {
  const [academias, setAcademias] = useState<AcademiaPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    // Cargar tenants activos y su infoPublica
    getDocs(query(collection(db, 'tenants'), where('active', '==', true)))
      .then(async (snap) => {
        const results: AcademiaPublica[] = [];
        await Promise.all(
          snap.docs.map(async (d) => {
            const t = d.data() as TenantDoc;
            // Cargar infoPublica si existe
            const infoSnap = await getDocs(collection(db, 'tenants', t.tenantId, 'infoPublica'));
            const info = infoSnap.empty ? null : infoSnap.docs[0].data();
            results.push({
              slug: t.slug,
              nombreNegocio: t.nombreNegocio,
              nombreProfesor: t.nombreProfesor,
              niveles: info?.niveles || [],
              ubicacion: info?.ubicacion || '',
              descripcion: info?.descripcion || '',
            });
          })
        );
        // Solo mostrar las que tienen infoPublica configurada
        setAcademias(results.filter((a) => a.descripcion || a.niveles.length > 0 || a.ubicacion));
        setLoading(false);
      });
  }, []);

  const filtradas = academias.filter((a) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      a.nombreNegocio.toLowerCase().includes(q) ||
      a.nombreProfesor.toLowerCase().includes(q) ||
      a.ubicacion.toLowerCase().includes(q) ||
      a.niveles.some((n) => n.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen" style={{ background: '#09090F' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #ffffff10' }}>
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polygon points="2,5 8,5 14,14 8,23 2,23 8,14" fill="#E8A020"/>
              <rect x="16" y="5" width="5" height="18" rx="1" fill="#F4EFE6"/>
              <polygon points="21,5 27,5 21,14" fill="#F4EFE6"/>
              <polygon points="21,14 27,23 21,23" fill="#F4EFE6"/>
            </svg>
            <div className="flex flex-col leading-none">
              <span className="font-black text-[16px] tracking-tight" style={{ color: '#F4EFE6' }}>VOLTEK</span>
              <span className="text-[9px] font-medium tracking-widest" style={{ color: '#E8A02060' }}>by KRONORIX</span>
            </div>
          </div>
          <a
            href="/login"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl"
            style={{ background: '#E8A020', color: '#09090F' }}
          >
            Acceder
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1
          className="text-[32px] sm:text-[42px] font-black tracking-tight mb-3 leading-tight"
          style={{ color: '#F4EFE6' }}
        >
          Encuentra tu profe de pádel
        </h1>
        <p className="text-base mb-8" style={{ color: '#F4EFE660' }}>
          Academias gestionadas con Voltek. Pregunta directamente al asistente de cada profe.
        </p>

        {/* Buscador */}
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 max-w-md mx-auto"
          style={{ background: '#ffffff08', border: '1px solid #E8A02040' }}
        >
          <svg width="16" height="16" fill="none" stroke="#F4EFE650" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ciudad o nivel…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#F4EFE6' }}
          />
        </div>
      </div>

      {/* Listado */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: '#F4EFE640' }}>Cargando academias…</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: '#F4EFE640' }}>
              {busqueda ? `Sin resultados para "${busqueda}"` : 'Todavía no hay academias en el directorio.'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtradas.map((a) => (
              <div
                key={a.slug}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid #ffffff10', background: '#ffffff06' }}
              >
                {/* Avatar y nombre */}
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #ffffff08' }}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black shrink-0"
                    style={{ background: '#E8A020', color: '#09090F' }}
                  >
                    {a.nombreNegocio.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: '#F4EFE6' }}>{a.nombreNegocio}</p>
                    <p className="text-xs truncate" style={{ color: '#F4EFE650' }}>por {a.nombreProfesor}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="px-5 py-3 space-y-2">
                  {a.descripcion && (
                    <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#F4EFE670' }}>
                      {a.descripcion}
                    </p>
                  )}
                  {a.ubicacion && (
                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#F4EFE650' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      {a.ubicacion}
                    </p>
                  )}
                  {a.niveles.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {a.niveles.map((n) => (
                        <span
                          key={n}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: '#E8A02015', color: '#E8A020' }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="px-5 py-3" style={{ borderTop: '1px solid #ffffff08' }}>
                  <a
                    href={`/${a.slug}/chat`}
                    className="w-full flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl transition-all"
                    style={{ background: '#E8A020', color: '#09090F' }}
                  >
                    Hablar con el asistente
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
