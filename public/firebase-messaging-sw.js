/**
 * firebase-messaging-sw.js
 * -----------------------------------------------------------------------
 * Service Worker que recibe los push de Firebase Cloud Messaging cuando
 * la app NO está abierta en primer plano (pestaña cerrada, navegador
 * minimizado, etc.). Sin este archivo, los push solo llegarían mientras
 * la pestaña está activa (ver onMessage en src/pushClient.ts).
 *
 * IMPORTANTE — antes de que esto funcione:
 * 1. Sustituye el objeto firebaseConfig de abajo por la configuración
 *    REAL de tu proyecto (la misma que tienes en lib/firebase.ts /
 *    Firebase Console > Configuración del proyecto > Tus apps > SDK).
 *    Este archivo NO puede leer variables de entorno de Next.js (es un
 *    Service Worker, se sirve como archivo estático), así que los
 *    valores van escritos literalmente aquí.
 * 2. Debe vivir en /public/firebase-messaging-sw.js para que Next.js lo
 *    sirva en la raíz del dominio (https://tu-dominio.com/firebase-
 *    messaging-sw.js) — los Service Workers de FCM deben servirse
 *    desde la raíz, no desde una subcarpeta.
 * -----------------------------------------------------------------------
 */

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// PENDIENTE: sustituir por la config real del proyecto Firebase.
firebase.initializeApp({
  apiKey: "AIzaSyAwE6WaxctXV0GN7PWAu6v5ihSVAGcliO4",
  authDomain: "kronorix-padel-suite.firebaseapp.com",
  projectId: "kronorix-padel-suite",
  storageBucket: "kronorix-padel-suite.firebasestorage.app",
  messagingSenderId: "364682197112",
  appId: "1:364682197112:web:5e15035bd17acad4ed158d",
});

const messaging = firebase.messaging();

// Personaliza aquí cómo se ve la notificación del sistema cuando la
// app está cerrada/en segundo plano.
messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || 'Kronorix';
  const opciones = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png', // ajusta si tienes otro icono
  };
  self.registration.showNotification(titulo, opciones);
});
