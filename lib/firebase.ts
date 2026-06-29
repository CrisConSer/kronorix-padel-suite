import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

/**
 * lib/firebase.ts
 * -----------------------------------------------------------------------
 * Inicializa Firebase para la app. En desarrollo local, conecta
 * automáticamente a los emuladores (Auth, Firestore, Functions) en vez
 * de hablar con el proyecto real en la nube — así toda la app (no solo
 * scripts sueltos) trabaja contra los mismos datos de prueba que ya
 * sembramos con seed.js.
 *
 * Cómo se decide "estamos en local": comprobamos NEXT_PUBLIC_USE_EMULATOR
 * en .env.local. Esto es explícito a propósito — NUNCA queremos que algo
 * se conecte al emulador "por accidente" en producción, así que exige un
 * valor puesto a mano en vez de inferirlo de NODE_ENV.
 * -----------------------------------------------------------------------
 */

// Igual que en Padel Planner: configuración real de tu proyecto Firebase.
// En el emulador, estos valores casi no importan (la mayoría de claves
// se ignoran), pero projectId SÍ debe coincidir con el de tu .firebaserc.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'fake-api-key-for-emulator',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'kronorix-padel-suite',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Evita reconectar los emuladores en cada hot-reload de Next.js (si no,
// Next puede re-ejecutar este módulo y lanzar "emulator already connected").
declare global {
  // eslint-disable-next-line no-var
  var __emulatorsConnected: boolean | undefined;
}

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === 'true';

if (useEmulator && typeof window !== 'undefined' && !globalThis.__emulatorsConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  globalThis.__emulatorsConnected = true;
  // eslint-disable-next-line no-console
  console.info('[Kronorix] Conectado a los emuladores de Firebase (local).');
}
