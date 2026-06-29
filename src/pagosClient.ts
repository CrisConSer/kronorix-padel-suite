import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AlumnoDoc, BonoDoc, ClaseDoc, MetodoPago, PagoDoc, TipoPago } from './types';

/**
 * pagosClient.ts
 * -----------------------------------------------------------------------
 * Modelo acordado:
 * - Los bonos los crea el profesor manualmente cuando el alumno paga
 *   (nº de clases, precio, fechas) — no se generan solos cada mes.
 * - Al marcar asistencia en el calendario, si el alumno tiene modalidad
 *   'bono' y un bono activo (alumno.bonoActualId), se descuenta 1 clase
 *   automáticamente en la misma transacción que marca la asistencia.
 * - Si el bono llega a 0 clases restantes o pasa su fechaFin, NO se
 *   bloquea al alumno — solo cambia su `estado` a 'agotado'/'caducado'
 *   para que el profesor lo vea como aviso informativo en Pagos.
 * -----------------------------------------------------------------------
 */

// ===================== Crear bono =====================

export type CrearBonoInput = {
  alumnoId: string;
  clasesContratadas: number;
  precio: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  createdBy: string;
  // Si se marca, también registra el pago asociado a este bono (lo
  // normal: el alumno paga y se crea el bono a la vez). Si no se marca,
  // el bono se crea como pendiente de pago — el profesor podrá
  // registrar el pago después desde la página de Pagos.
  registrarPagoAhora: boolean;
  metodoPago?: MetodoPago;
};

export async function crearBono(tenantId: string, input: CrearBonoInput): Promise<string> {
  const bonoRef = doc(collection(db, 'tenants', tenantId, 'bonos'));
  const alumnoRef = doc(db, 'tenants', tenantId, 'alumnos', input.alumnoId);

  await runTransaction(db, async (tx) => {
    tx.set(bonoRef, {
      bonoId: bonoRef.id,
      alumnoId: input.alumnoId,
      clasesContratadas: input.clasesContratadas,
      clasesConsumidas: 0,
      precio: input.precio,
      fechaInicio: Timestamp.fromDate(new Date(input.fechaInicio)),
      fechaFin: Timestamp.fromDate(new Date(input.fechaFin)),
      estado: 'activo',
      createdAt: serverTimestamp(),
      createdBy: input.createdBy,
    });

    // El alumno pasa a tener este bono como "el actual" — es lo que
    // usa marcarAsistencia() para saber de dónde descontar.
    tx.update(alumnoRef, { bonoActualId: bonoRef.id });

    if (input.registrarPagoAhora) {
      const pagoRef = doc(collection(db, 'tenants', tenantId, 'pagos'));
      tx.set(pagoRef, {
        pagoId: pagoRef.id,
        alumnoId: input.alumnoId,
        tipo: 'bono' as TipoPago,
        bonoId: bonoRef.id,
        importe: input.precio,
        metodo: input.metodoPago || 'efectivo',
        fecha: serverTimestamp(),
        registradoPor: input.createdBy,
      });
    }
  });

  return bonoRef.id;
}

// ===================== Editar bono (corrección de errores) =====================

export type ActualizarBonoInput = {
  clasesContratadas: number;
  clasesConsumidas: number;
  precio: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
};

/**
 * Edición completa de un bono ya creado, incluyendo clasesConsumidas a
 * mano (acordado explícitamente: a veces hay que corregir un error de
 * conteo). El `estado` se recalcula a partir de los nuevos valores en
 * vez de dejarlo como estaba, para que quede coherente tras la edición.
 */
export async function actualizarBono(
  tenantId: string,
  bonoId: string,
  input: ActualizarBonoInput
): Promise<void> {
  const bonoRef = doc(db, 'tenants', tenantId, 'bonos', bonoId);
  const fechaFinDate = new Date(input.fechaFin);
  const agotado = input.clasesConsumidas >= input.clasesContratadas;
  const caducado = !agotado && fechaFinDate.getTime() < Date.now();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bonoRef);
    if (!snap.exists()) throw new Error('El bono ya no existe.');

    tx.update(bonoRef, {
      clasesContratadas: input.clasesContratadas,
      clasesConsumidas: input.clasesConsumidas,
      precio: input.precio,
      fechaInicio: Timestamp.fromDate(new Date(input.fechaInicio)),
      fechaFin: Timestamp.fromDate(fechaFinDate),
      estado: agotado ? 'agotado' : caducado ? 'caducado' : 'activo',
    });
  });
}

// ===================== Registrar pago suelto =====================

export type RegistrarPagoSueltoInput = {
  alumnoId: string;
  claseId?: string;
  importe: number;
  metodo: MetodoPago;
  registradoPor: string;
};

export async function registrarPagoSuelto(
  tenantId: string,
  input: RegistrarPagoSueltoInput

): Promise<string> {
  const pagoRef = doc(collection(db, 'tenants', tenantId, 'pagos'));
  await runTransaction(db, async (tx) => {
    tx.set(pagoRef, {
      pagoId: pagoRef.id,
      alumnoId: input.alumnoId,
      tipo: 'suelta' as TipoPago,
      claseId: input.claseId || null,
      importe: input.importe,
      metodo: input.metodo,
      fecha: serverTimestamp(),
      registradoPor: input.registradoPor,
    });
  });
  return pagoRef.id;
}

// ===================== Editar / borrar pago =====================

/**
 * Edita importe y método de un pago suelto. Solo aplica a pagos de
 * tipo 'suelta' — los de tipo 'bono' se editan corrigiendo el bono
 * asociado (actualizarBono), no el pago en sí, para no desincronizar
 * el precio del bono con el importe del pago que lo originó.
 */
export async function editarPagoSuelto(
  tenantId: string,
  pagoId: string,
  cambios: { importe: number; metodo: MetodoPago }
): Promise<void> {
  const pagoRef = doc(db, 'tenants', tenantId, 'pagos', pagoId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(pagoRef);
    if (!snap.exists()) throw new Error('El pago ya no existe.');
    tx.update(pagoRef, { importe: cambios.importe, metodo: cambios.metodo });
  });
}

/**
 * Borra un pago. Si era de tipo 'bono' (acordado explícitamente),
 * revierte también el bono que ese pago originó: lo borra, y si era
 * el bono activo del alumno, le quita bonoActualId. Esto evita dejar
 * un bono "pagado fantasma" sin su pago correspondiente.
 *
 * Si el bono asociado ya tiene clases consumidas (el alumno ya asistió
 * a alguna clase con él), se avisa en el mensaje de confirmación desde
 * la UI antes de llamar a esta función — aquí se borra igualmente, es
 * decisión del profesor confirmar que quiere revertirlo del todo.
 */
export async function borrarPago(tenantId: string, pagoId: string): Promise<void> {
  const pagoRef = doc(db, 'tenants', tenantId, 'pagos', pagoId);

  await runTransaction(db, async (tx) => {
    const pagoSnap = await tx.get(pagoRef);
    if (!pagoSnap.exists()) throw new Error('El pago ya no existe.');
    const pago = pagoSnap.data() as PagoDoc;

    tx.delete(pagoRef);

    if (pago.tipo === 'bono' && pago.bonoId) {
      const bonoRef = doc(db, 'tenants', tenantId, 'bonos', pago.bonoId);
      const bonoSnap = await tx.get(bonoRef);
      if (bonoSnap.exists()) {
        tx.delete(bonoRef);

        const alumnoRef = doc(db, 'tenants', tenantId, 'alumnos', pago.alumnoId);
        const alumnoSnap = await tx.get(alumnoRef);
        if (alumnoSnap.exists()) {
          const alumno = alumnoSnap.data() as AlumnoDoc;
          if (alumno.bonoActualId === pago.bonoId) {
            tx.update(alumnoRef, { bonoActualId: null });
          }
        }
      }
    }
  });
}

// ===================== Marcar asistencia (con descuento de bono) =====================

/**
 * Marca a un alumno como "asistió" a una clase ya pasada/en curso, y si
 * tiene modalidad 'bono' con un bono activo, descuenta 1 clase de ese
 * bono en la MISMA transacción — así nunca queda la clase marcada sin
 * el descuento aplicado, o viceversa.
 *
 * No bloquea si el bono no tiene clases restantes: solo actualiza su
 * `estado` a 'agotado' para que se vea en Pagos. Es informativo, según
 * lo acordado.
 */
export async function marcarAsistencia(
  tenantId: string,
  claseId: string,
  alumnoId: string,
  alumno: AlumnoDoc
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);

  await runTransaction(db, async (tx) => {
    const claseSnap = await tx.get(claseRef);
    if (!claseSnap.exists()) throw new Error('La clase ya no existe.');
    const clase = claseSnap.data() as ClaseDoc;

    if (!clase.alumnosIds.includes(alumnoId)) {
      throw new Error('Ese alumno no está asignado a esta clase.');
    }
    if (clase.alumnosAsistieron.includes(alumnoId)) {
      return; // ya estaba marcado, no hacer nada (evita doble descuento)
    }

    tx.update(claseRef, {
      alumnosAsistieron: [...clase.alumnosAsistieron, alumnoId],
    });

    // Descuento automático de bono, solo si aplica.
    if (alumno.modalidad === 'bono' && alumno.bonoActualId) {
      const bonoRef = doc(db, 'tenants', tenantId, 'bonos', alumno.bonoActualId);
      const bonoSnap = await tx.get(bonoRef);
      if (bonoSnap.exists()) {
        const bono = bonoSnap.data() as BonoDoc;
        const nuevasConsumidas = bono.clasesConsumidas + 1;
        const agotado = nuevasConsumidas >= bono.clasesContratadas;
        tx.update(bonoRef, {
          clasesConsumidas: nuevasConsumidas,
          estado: agotado ? 'agotado' : bono.estado,
        });
      }
    }
  });
}

/**
 * Revertir una asistencia ya marcada (por error, ej. el profesor se
 * equivocó de alumno). Devuelve la clase consumida al bono si aplica.
 */
export async function desmarcarAsistencia(
  tenantId: string,
  claseId: string,
  alumnoId: string,
  alumno: AlumnoDoc
): Promise<void> {
  const claseRef = doc(db, 'tenants', tenantId, 'clases', claseId);

  await runTransaction(db, async (tx) => {
    const claseSnap = await tx.get(claseRef);
    if (!claseSnap.exists()) throw new Error('La clase ya no existe.');
    const clase = claseSnap.data() as ClaseDoc;

    if (!clase.alumnosAsistieron.includes(alumnoId)) return; // no estaba marcado

    tx.update(claseRef, {
      alumnosAsistieron: clase.alumnosAsistieron.filter((id) => id !== alumnoId),
    });

    if (alumno.modalidad === 'bono' && alumno.bonoActualId) {
      const bonoRef = doc(db, 'tenants', tenantId, 'bonos', alumno.bonoActualId);
      const bonoSnap = await tx.get(bonoRef);
      if (bonoSnap.exists()) {
        const bono = bonoSnap.data() as BonoDoc;
        const nuevasConsumidas = Math.max(0, bono.clasesConsumidas - 1);
        tx.update(bonoRef, {
          clasesConsumidas: nuevasConsumidas,
          estado: nuevasConsumidas < bono.clasesContratadas ? 'activo' : bono.estado,
        });
      }
    }
  });
}

// ===================== Estado efectivo del bono (sin cron) =====================

/**
 * No hay Cloud Function con cron en este proyecto todavía que marque
 * los bonos caducados por fecha automáticamente. En vez de eso, este
 * helper calcula el estado "real" a mostrar en pantalla combinando el
 * campo `estado` guardado (que sí se actualiza al agotarse por uso, ver
 * marcarAsistencia) con la fecha de caducidad, sin necesitar escritura.
 * Si más adelante se añade una Cloud Function con cron para esto, se
 * puede retirar este cálculo en cliente sin tocar el resto del código.
 */
export function estadoEfectivoBono(bono: BonoDoc): 'activo' | 'agotado' | 'caducado' {
  if (bono.estado === 'agotado') return 'agotado';
  const ahora = Timestamp.now();
  if (bono.fechaFin.toMillis() < ahora.toMillis()) return 'caducado';
  return 'activo';
}

export function clasesRestantes(bono: BonoDoc): number {
  return Math.max(0, bono.clasesContratadas - bono.clasesConsumidas);
}
