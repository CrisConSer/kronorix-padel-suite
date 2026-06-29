/**
 * seed.js
 * -----------------------------------------------------------------------
 * Puebla el EMULADOR de Firebase (Auth + Firestore) con un escenario de
 * prueba completo para validar el aislamiento multi-tenant: 2 tenants
 * (Pablo y Cris), un alumno (Estefi) y un super admin (Kronorix).
 *
 * Usa el Admin SDK (no el de cliente) porque así podemos fijar el UID
 * de cada usuario nosotros mismos -> los documentos de Firestore y los
 * usuarios de Auth quedan SIEMPRE enlazados con el mismo UID, sin tener
 * que copiar UIDs generados al azar entre pantallas.
 *
 * IMPORTANTE: este script SOLO funciona contra el emulador. Las
 * variables FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST hacen
 * que el Admin SDK redirija TODO al emulador en vez de a un proyecto
 * real, así que es seguro ejecutarlo tantas veces como quieras.
 *
 * Requiere que el emulador esté corriendo en otra ventana:
 *   firebase emulators:start --export-on-exit=./emulator-data --import=./emulator-data
 *
 * Uso:
 *   node seed.js
 * -----------------------------------------------------------------------
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// El projectId debe coincidir con el de tu .firebaserc ("default").
// AJUSTA esto si tu projectId real es distinto.
const PROJECT_ID = 'kronorix-padel-suite';

const app = initializeApp({ projectId: PROJECT_ID });

const auth = getAuth(app);
const db = getFirestore(app);

// UIDs FIJOS a propósito (no aleatorios) para que coincidan siempre,
// ejecución tras ejecución, con el script test-reglas.js.
const UID = {
  pablo: 'uid-pablo-test',
  cris: 'uid-cris-test',
  estefi: 'uid-estefi-test',
  kronorix: 'uid-kronorix-test',
};

const PASSWORD = 'Test1234!';

async function upsertAuthUser(uid, email) {
  try {
    await auth.getUser(uid);
    // Ya existe: nos asegura la contraseña por si se cambió a mano.
    await auth.updateUser(uid, { email, password: PASSWORD });
    console.log(`  ~ usuario Auth ya existía, contraseña reafirmada: ${email}`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await auth.createUser({ uid, email, password: PASSWORD, emailVerified: true });
      console.log(`  + usuario Auth creado: ${email} (uid: ${uid})`);
    } else {
      throw e;
    }
  }
}

async function main() {
  console.log('--- 1) Usuarios en Authentication ---');
  await upsertAuthUser(UID.pablo, 'pablo@test.com');
  await upsertAuthUser(UID.cris, 'cris@test.com');
  await upsertAuthUser(UID.estefi, 'estefi@test.com');
  await upsertAuthUser(UID.kronorix, 'kronorix@test.com');

  console.log('\n--- 2) Documentos en Firestore ---');

  await db.doc(`platformAdmins/${UID.kronorix}`).set({
    since: Timestamp.now(),
  });
  console.log(`  + platformAdmins/${UID.kronorix}`);

  await db.doc('tenants/tenant-pablo').set({
    tenantId: 'tenant-pablo',
    slug: 'pablomiki',
    nombreProfesor: 'Pablo Miki',
    nombreNegocio: 'Pablo Miki Padel',
    email: 'pablo@test.com',
    branding: { colorPrimario: '#E8A020', colorSecundario: '#09090F' },
    config: { duracionClaseMinutos: 60, avisoCancelacionHoras: 24, monedaSimbolo: '€' },
    plan: 'trial',
    active: true,
    createdAt: Timestamp.now(),
    createdBy: UID.kronorix,
  });
  console.log('  + tenants/tenant-pablo');

  await db.doc('tenants/tenant-cris').set({
    tenantId: 'tenant-cris',
    slug: 'cris',
    nombreProfesor: 'Cris',
    nombreNegocio: 'Cris Padel',
    email: 'cris@test.com',
    branding: { colorPrimario: '#E8A020', colorSecundario: '#09090F' },
    config: { duracionClaseMinutos: 60, avisoCancelacionHoras: 24, monedaSimbolo: '€' },
    plan: 'trial',
    active: true,
    createdAt: Timestamp.now(),
    createdBy: UID.kronorix,
  });
  console.log('  + tenants/tenant-cris');

  await db.doc(`users/${UID.pablo}`).set({
    uid: UID.pablo,
    email: 'pablo@test.com',
    displayName: 'Pablo Miki',
    role: 'admin',
    tenantId: 'tenant-pablo',
    alumnoId: null,
    active: true,
    createdAt: Timestamp.now(),
    createdBy: UID.kronorix,
  });
  console.log(`  + users/${UID.pablo} (admin de tenant-pablo)`);

  await db.doc(`users/${UID.cris}`).set({
    uid: UID.cris,
    email: 'cris@test.com',
    displayName: 'Cris',
    role: 'admin',
    tenantId: 'tenant-cris',
    alumnoId: null,
    active: true,
    createdAt: Timestamp.now(),
    createdBy: UID.kronorix,
  });
  console.log(`  + users/${UID.cris} (admin de tenant-cris)`);

  await db.doc(`users/${UID.estefi}`).set({
    uid: UID.estefi,
    email: 'estefi@test.com',
    displayName: 'Estefi',
    role: 'alumno',
    tenantId: 'tenant-pablo',
    alumnoId: 'alumno-1',
    active: true,
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log(`  + users/${UID.estefi} (alumna de tenant-pablo)`);

  await db.doc(`users/${UID.kronorix}`).set({
    uid: UID.kronorix,
    email: 'kronorix@test.com',
    displayName: 'Kronorix Admin',
    role: 'super_admin',
    tenantId: null,
    alumnoId: null,
    active: true,
    createdAt: Timestamp.now(),
    createdBy: 'system',
  });
  console.log(`  + users/${UID.kronorix} (super_admin)`);

  // Tag de prueba: "Intermedio" — necesario porque ahora los alumnos
  // exigen al menos 1 tag (lo usa el calendario para huecos compatibles).
  const tagIntermedioRef = db.collection('tenants/tenant-pablo/tags').doc('tag-intermedio');
  await tagIntermedioRef.set({
    tagId: 'tag-intermedio',
    nombre: 'Intermedio',
    color: '#E8A020',
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log('  + tenants/tenant-pablo/tags/tag-intermedio');

  await db.doc('tenants/tenant-pablo/alumnos/alumno-1').set({
    alumnoId: 'alumno-1',
    uid: UID.estefi,
    nombre: 'Estefi',
    estado: 'activo',
    modalidad: 'bono',
    bonoActualId: null,
    notas: '',
    tagsIds: ['tag-intermedio'],
    fechaAlta: Timestamp.now(),
    fechaBaja: null,
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log('  + tenants/tenant-pablo/alumnos/alumno-1 (tag: Intermedio)');

  // Segundo alumno, SIN login propio (uid: null), con el mismo tag que
  // Estefi -> sirve para probar "hueco compatible" en el calendario.
  await db.doc('tenants/tenant-pablo/alumnos/alumno-2').set({
    alumnoId: 'alumno-2',
    uid: null,
    nombre: 'Marta Ruiz',
    estado: 'activo',
    modalidad: 'suelta',
    bonoActualId: null,
    notas: '',
    tagsIds: ['tag-intermedio'],
    fechaAlta: Timestamp.now(),
    fechaBaja: null,
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log('  + tenants/tenant-pablo/alumnos/alumno-2 (Marta Ruiz, tag: Intermedio)');

  // Clase de prueba: capacidad 3, solo Estefi asignada -> quedan 2
  // huecos libres, compatibles con cualquier alumno que tenga el tag
  // "Intermedio" (Marta encaja).
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 2);
  const fechaClase = mañana.toISOString().slice(0, 10);

  await db.doc('tenants/tenant-pablo/clases/clase-1').set({
    claseId: 'clase-1',
    fecha: fechaClase,
    hora: '18:00',
    duracionMinutos: 60,
    pista: 'Pista 1',
    tipo: 'grupo',
    capacidad: 3,
    titulo: 'Grupo Intermedio',
    alumnosIds: ['alumno-1'],
    alumnosAsistieron: [],
    alumnosCancelaron: [],
    listaEsperaIds: [],
    estado: 'programada',
    notas: '',
    tagsCompatibles: ['tag-intermedio'],
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log(`  + tenants/tenant-pablo/clases/clase-1 (${fechaClase} 18:00, 1/3, hueco libre)`);

  // Bono de ejemplo para Estefi (modalidad 'bono'), con 8 clases
  // contratadas y 0 consumidas -> para probar el descuento automático
  // al marcar asistencia en el calendario.
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const finMes = new Date(inicioMes);
  finMes.setMonth(finMes.getMonth() + 1);

  await db.doc('tenants/tenant-pablo/bonos/bono-1').set({
    bonoId: 'bono-1',
    alumnoId: 'alumno-1',
    clasesContratadas: 8,
    clasesConsumidas: 0,
    precio: 80,
    fechaInicio: Timestamp.fromDate(inicioMes),
    fechaFin: Timestamp.fromDate(finMes),
    estado: 'activo',
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log('  + tenants/tenant-pablo/bonos/bono-1 (Estefi, 8 clases, 0 consumidas)');

  await db.doc('tenants/tenant-pablo/alumnos/alumno-1').update({ bonoActualId: 'bono-1' });
  console.log('  ~ alumno-1.bonoActualId = bono-1');

  await db.doc('tenants/tenant-pablo/pagos/pago-1').set({
    pagoId: 'pago-1',
    alumnoId: 'alumno-1',
    tipo: 'bono',
    bonoId: 'bono-1',
    importe: 80,
    metodo: 'efectivo',
    fecha: Timestamp.now(),
    registradoPor: UID.pablo,
  });
  console.log('  + tenants/tenant-pablo/pagos/pago-1 (80€, efectivo)');

  // --- Datos de ejemplo para el dashboard ---

  // Una clase PASADA (hace 10 días) donde Estefi asistió -> alimenta
  // "ocupación por día" e "ingresos" (si tuviera pago asociado a esa
  // fecha), y sirve para que alumnosEnRiesgo tenga algo que comparar.
  const hace10dias = new Date();
  hace10dias.setDate(hace10dias.getDate() - 10);
  const fechaPasada = hace10dias.toISOString().slice(0, 10);

  await db.doc('tenants/tenant-pablo/clases/clase-pasada-1').set({
    claseId: 'clase-pasada-1',
    fecha: fechaPasada,
    hora: '18:00',
    duracionMinutos: 60,
    pista: 'Pista 1',
    tipo: 'individual',
    capacidad: 1,
    titulo: '',
    alumnosIds: ['alumno-1'],
    alumnosAsistieron: ['alumno-1'],
    alumnosCancelaron: [],
    listaEsperaIds: [],
    estado: 'completada',
    notas: '',
    tagsCompatibles: ['tag-intermedio'],
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log(`  + tenants/tenant-pablo/clases/clase-pasada-1 (${fechaPasada}, Estefi asistió)`);

  // Una clase FUTURA donde Marta canceló avisando -> alimenta el
  // ranking de cancelaciones del dashboard.
  const enCincoDias = new Date();
  enCincoDias.setDate(enCincoDias.getDate() + 5);
  const fechaFutura = enCincoDias.toISOString().slice(0, 10);

  await db.doc('tenants/tenant-pablo/clases/clase-cancelada-1').set({
    claseId: 'clase-cancelada-1',
    fecha: fechaFutura,
    hora: '19:00',
    duracionMinutos: 60,
    pista: 'Pista 2',
    tipo: 'individual',
    capacidad: 1,
    titulo: '',
    alumnosIds: [],
    alumnosAsistieron: [],
    alumnosCancelaron: ['alumno-2'],
    listaEsperaIds: [],
    estado: 'programada',
    notas: '',
    tagsCompatibles: ['tag-intermedio'],
    createdAt: Timestamp.now(),
    createdBy: UID.pablo,
  });
  console.log(`  + tenants/tenant-pablo/clases/clase-cancelada-1 (Marta canceló)`);

  console.log('\n✅ Seed completo. UIDs fijos usados (para test-reglas.js):');
  console.log(UID);

  process.exit(0);
}

main().catch((e) => {
  console.error('🔥 Error en el seed:', e);
  process.exit(1);
});
