@echo off
REM -----------------------------------------------------------------------
REM Arranca el emulador de Firebase con PERSISTENCIA: guarda el estado de
REM Auth + Firestore al cerrar (Ctrl+C) y lo recarga la próxima vez que
REM lo arrancas. Así no se pierde nada entre sesiones de trabajo.
REM -----------------------------------------------------------------------
set JAVA_HOME=%~dp0jdk-21\jdk-21.0.11+10
set PATH=%JAVA_HOME%\bin;%PATH%
java -version
firebase emulators:start --export-on-exit=./emulator-data --import=./emulator-data
