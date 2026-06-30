"use strict";
/**
 * functions/src/index.ts
 * -----------------------------------------------------------------------
 * Punto de entrada único de Cloud Functions. Firebase despliega TODO lo
 * que se exporte desde aquí (directa o indirectamente) — cada función
 * vive en su propio archivo por claridad, y aquí solo se reexportan.
 * -----------------------------------------------------------------------
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitarAlumno = exports.recordatorioClases = exports.crearProfesor = void 0;
var crearProfesor_1 = require("./crearProfesor");
Object.defineProperty(exports, "crearProfesor", { enumerable: true, get: function () { return crearProfesor_1.crearProfesor; } });
var recordatorioClases_1 = require("./recordatorioClases");
Object.defineProperty(exports, "recordatorioClases", { enumerable: true, get: function () { return recordatorioClases_1.recordatorioClases; } });
var invitarAlumno_1 = require("./invitarAlumno");
Object.defineProperty(exports, "invitarAlumno", { enumerable: true, get: function () { return invitarAlumno_1.invitarAlumno; } });
//# sourceMappingURL=index.js.map