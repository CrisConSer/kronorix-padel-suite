# Notificaciones push 24h antes — guía de conexión

Este código está completo y validado (`tsc` + `next build`), pero **no se puede
probar en el emulador** — FCM solo funciona contra un proyecto Firebase real.
Sigue estos pasos en orden cuando tengas tiempo de configurarlo.

## Paso 1 — Pasar el proyecto a plan Blaze

Los triggers de tipo *scheduler* (Cloud Functions que se ejecutan solas, sin que
nadie las llame) **no funcionan en el plan gratuito Spark**. Necesitas Blaze.

1. Consola Firebase → ⚙️ → **Uso y facturación** → **Modificar plan**
2. Selecciona **Blaze** (pago por uso). Tiene un nivel gratuito generoso —
   para el volumen de un puñado de profesores no deberías pagar nada en la
   práctica, pero Google exige una tarjeta asociada para activarlo.

## Paso 2 — Activar Cloud Messaging y generar las claves VAPID

1. Consola Firebase → ⚙️ Configuración del proyecto → pestaña **Cloud Messaging**
2. Si la API no está habilitada, sigue el enlace que te ofrece para activarla
   en Google Cloud Console
3. Busca la sección **"Certificados push web"** → **"Generar par de claves"**
4. Copia la clave pública (empieza por `B...`, es larga)

## Paso 3 — Pegar la clave VAPID en el código

Abre `src/pushClient.ts` y sustituye:

```ts
const VAPID_KEY = 'PENDIENTE_PEGAR_CLAVE_VAPID_PUBLICA';
```

por tu clave real.

## Paso 4 — Completar la configuración del Service Worker

Abre `public/firebase-messaging-sw.js` y sustituye el objeto `firebaseConfig`
por los valores reales de tu proyecto (los mismos que usas en `lib/firebase.ts`
o que ves en Consola Firebase → ⚙️ → Tus apps → Configuración del SDK):

```js
firebase.initializeApp({
  apiKey: 'TU_API_KEY_REAL',
  authDomain: 'kronorix-padel-suite.firebaseapp.com',
  projectId: 'kronorix-padel-suite',
  storageBucket: 'kronorix-padel-suite.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
});
```

Este archivo no puede leer `.env.local` (es un Service Worker, se sirve como
archivo estático) — por eso los valores van escritos literalmente aquí, no
hay forma de evitarlo sin un paso de build adicional.

## Paso 5 — Desplegar reglas, índices y Cloud Functions

```cmd
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

Si es la primera vez que despliegas Functions desde este proyecto, puede que
te pida inicializar la carpeta `functions/` con su propio `package.json`:

```cmd
cd functions
npm init -y
npm install firebase-admin firebase-functions
cd ..
firebase deploy --only functions
```

## Paso 6 — Probar de extremo a extremo

1. Entra como un alumno con login propio (ej. `estefi@test.com` en local, o
   el alumno real en producción)
2. En `/mi-cuenta`, pulsa **"Activar recordatorios"** — el navegador debe
   pedir permiso de notificaciones
3. Acepta. Comprueba en Firestore que `users/{uid}.fcmToken` ya tiene un
   valor (antes era `null`)
4. Crea una clase para ese alumno con fecha/hora dentro de las próximas
   23-25 horas
5. Espera a la siguiente ejecución horaria de la función (o dispárala
   manualmente desde la consola de Cloud Functions / con el CLI:
   `firebase functions:shell` y llamando a `recordatorioClases()`)
6. Deberías recibir el push en el dispositivo donde diste el permiso

## Qué hace exactamente la función (`functions/src/recordatorioClases.ts`)

- Se ejecuta **cada hora**, sola
- Busca clases de cada tenant activo cuya fecha+hora cae entre 23h y 25h a
  partir de "ahora" (ventana de 2h para no depender de que el scheduler
  dispare en el minuto exacto)
- Por cada clase encontrada sin recordatorio enviado aún, busca el `uid` de
  cada alumno asignado, y de ahí su `fcmToken`
- Envía el push con `sendEachForMulticast` (uno por clase, a todos los
  alumnos de esa clase a la vez)
- Marca la clase con `recordatorioEnviado: true` para no repetir el aviso

## Limitaciones conocidas de esta primera versión

- Solo avisa al **alumno**, no al profesor (así se decidió)
- Si un alumno no tiene login propio (`uid: null` en su ficha), no recibe
  nada — no hay a quién enviarle el push
- Si el alumno revoca el permiso de notificaciones desde el navegador, deja
  de recibir avisos pero su `fcmToken` sigue guardado hasta que vuelva a
  visitar la página (el token se regenera/limpia solo en el flujo normal de
  FCM, no hay limpieza activa de tokens caducados en esta versión)
- No hay reintento si el push falla por cualquier motivo — se marca como
  enviado igualmente para no bloquear el resto de la ejecución
