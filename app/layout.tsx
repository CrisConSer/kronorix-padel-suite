import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Voltek — Gestión para profesores de pádel',
  description: 'Gestión inteligente de clases, alumnos y pagos para profesores de pádel. by Kronorix.',
  applicationName: 'Voltek',
  keywords: ['pádel', 'gestión', 'clases', 'alumnos', 'profesores', 'voltek'],
  authors: [{ name: 'Kronorix' }],
  creator: 'Kronorix',
  publisher: 'Kronorix',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    title: 'Voltek by Kronorix',
    description: 'Gestión inteligente para profesores de pádel',
    url: 'https://voltek.app',
    siteName: 'Voltek',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Voltek by Kronorix',
    description: 'Gestión inteligente para profesores de pádel',
  },
  themeColor: '#09090F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
