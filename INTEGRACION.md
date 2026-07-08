# Cuadro de mando de profesores — integración

## 1. Backend (Cloud Function)
Copia `functions/getEstadisticasProfesores.ts` a tu carpeta `functions/src/` y
expórtala desde tu `functions/src/index.ts` junto a `crearProfesor`:

```ts
export { crearProfesor } from './crearProfesor';
export { getEstadisticasProfesores } from './getEstadisticasProfesores';
```

Despliega solo las funciones:
```bash
firebase deploy --only functions
```

## 2. Requisito de datos: campo `actualizadoEn`
Para calcular "última actividad" la función busca el campo `actualizadoEn`
en cada documento de `tenants/{id}/clases`. Si tus documentos de clase ya
guardan `serverTimestamp()` al crear/editar, no tienes que tocar nada. Si no,
añade una línea al crear o editar una clase:

```ts
import { serverTimestamp } from 'firebase/firestore';
// ...dentro del set/update de la clase:
actualizadoEn: serverTimestamp(),
```

## 3. Frontend
Copia:
- `src/useEstadisticasProfesores.ts`
- `src/ProfesorStatsCard.tsx`

En `app/superadmin/profesores/page.tsx` (tu `ProfesoresPage.tsx`), dentro del
componente, añade:

```tsx
import { useEstadisticasProfesores } from '@/src/useEstadisticasProfesores';
import { ProfesorStatsCard } from '@/src/ProfesorStatsCard';

// dentro de ProfesoresPage():
const { porTenant, loading: loadingStats } = useEstadisticasProfesores(
  user?.role === 'super_admin'
);
```

Y dentro del `.map(tenants)` donde ya pintas cada tarjeta, justo antes de
cerrar la tarjeta, añade:

```tsx
<ProfesorStatsCard stats={porTenant[tenant.tenantId]} loading={loadingStats} />
```

## Resultado
Cada tarjeta de profesor pasa de mostrar solo nombre/negocio/estado a mostrar
además: nº de alumnos, nº de clases, cuándo fue la última actividad, y un
semáforo (🟢 activo / 🟡 atención / 🔴 inactivo) calculado sobre esa fecha.
Nada de esto expone nombres, pagos ni notas — son conteos y una fecha.
