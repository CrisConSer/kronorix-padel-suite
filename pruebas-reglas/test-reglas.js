/**
 * test-reglas.js
 * -----------------------------------------------------------------------
 * Prueba manual de aislamiento multi-tenant contra el EMULADOR de
 * Firebase (no toca producción). Ejecutar con: node test-reglas.js
 *
 * Requiere que el emulador esté corriendo en otra ventana:
 *   firebase emulators:start
 * -----------------------------------------------------------------------
 */

const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc } = require('firebase/firestore');

// Config "falsa": el emulador no valida estas claves, solo necesita
// un projectId que coincida con el de tu .firebaserc
const app = initializeApp({
  apiKey: 'fake-api-key',
  projectId: 'kronorix-padel-suite', // <-- AJUSTA si tu projectId es distinto
});

const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, 'http://127.0.0.1:9099');
connectFirestoreEmulator(db, '127.0.0.1', 8080);

// ---- Estas credenciales las crea seed.js siempre igual, no hace falta
// ---- copiarlas a mano: ejecuta "node seed.js" antes de este script.
const USERS = {
  pablo:     { email: 'pablo@test.com',    password: 'Test1234!' },
  cris:      { email: 'cris@test.com',     password: 'Test1234!' },
  estefi:    { email: 'estefi@test.com',   password: 'Test1234!' },
  kronorix:  { email: 'kronorix@test.com', password: 'Test1234!' },
};

async function probarLectura(nombreUsuario, credenciales, path, descripcion) {
  try {
    await signInWithEmailAndPassword(auth, credenciales.email, credenciales.password);
    const snap = await getDoc(doc(db, path));
    if (snap.exists()) {
      console.log(`✅ PERMITIDO  | ${nombreUsuario} lee ${path} -> ${descripcion}`);
    } else {
      console.log(`⚠️  SIN DATOS | ${nombreUsuario} leyó ${path} pero el doc no existe -> ${descripcion}`);
    }
  } catch (e) {
    if (e.code === 'permission-denied' || /permission/i.test(e.message)) {
      console.log(`❌ BLOQUEADO  | ${nombreUsuario} lee ${path} -> ${descripcion}`);
    } else {
      console.log(`🔥 ERROR      | ${nombreUsuario} lee ${path} -> ${e.code || e.message}`);
    }
  }
}

async function main() {
  console.log('--- Caso 1: Pablo lee su propio alumno (Estefi) ---');
  await probarLectura('Pablo', USERS.pablo, 'tenants/tenant-pablo/alumnos/alumno-1', 'debería ser PERMITIDO');

  console.log('\n--- Caso 2: Cris intenta leer el alumno de Pablo (otro tenant) ---');
  await probarLectura('Cris', USERS.cris, 'tenants/tenant-pablo/alumnos/alumno-1', 'debería ser BLOQUEADO');

  console.log('\n--- Caso 3: Estefi lee su propia ficha ---');
  await probarLectura('Estefi', USERS.estefi, 'tenants/tenant-pablo/alumnos/alumno-1', 'debería ser PERMITIDO');

  console.log('\n--- Caso 4: Kronorix (super admin) intenta leer la ficha del alumno ---');
  await probarLectura('Kronorix', USERS.kronorix, 'tenants/tenant-pablo/alumnos/alumno-1', 'debería ser BLOQUEADO (por diseño)');

  console.log('\n--- Caso 5: Kronorix lee los metadatos del tenant (sí permitido) ---');
  await probarLectura('Kronorix', USERS.kronorix, 'tenants/tenant-pablo', 'debería ser PERMITIDO');

  process.exit(0);
}

main();
