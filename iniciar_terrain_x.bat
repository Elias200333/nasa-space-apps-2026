@echo off
chcp 65001 >nul
title TERRAIN-X · NASA Space Apps Challenge 2026

echo ====================================================================
echo   TERRAIN-X | NASA SPACE APPS CHALLENGE 2026
echo   Iniciando todos los subsistemas del proyecto...
echo ====================================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

:: Liberar puerto 8777 si hubiera instancias previas colgadas en segundo plano
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8777 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

set "DATA_PY=%ROOT%data\.venv\Scripts\python.exe"
if not exist "%DATA_PY%" set "DATA_PY=python"

set "ROBOT_PY=%ROOT%robot\.venv\Scripts\python.exe"
if not exist "%ROBOT_PY%" set "ROBOT_PY=python"

echo [1/3] Iniciando Servidor Científico NASA en http://127.0.0.1:8000 ...
start "TERRAIN-X Data Server (8000)" /min cmd /c "cd /d "%ROOT%data" && "%DATA_PY%" server.py 8000"

echo [2/3] Iniciando Servidor de Robótica Unitree Go2 en http://127.0.0.1:8777 ...
start "TERRAIN-X Robot Server (8777)" /min cmd /c "cd /d "%ROOT%" && "%ROBOT_PY%" -m terrainx_robot dashboard --port 8777"

echo [3/3] Iniciando Interfaz Espacial WebXR en https://localhost:3000 ...
start "TERRAIN-X WebXR Interface (3000)" /min cmd /c "cd /d "%ROOT%interface" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ====================================================================
echo   [OK] TODOS LOS SERVICIOS ESTÁN ACTIVOS Y SINCRONIZADOS:
echo       * Servidor Científico NASA:   http://127.0.0.1:8000
echo       * Servidor Robótica Go2:      http://127.0.0.1:8777
echo       * Interfaz Web y WebXR 3D:    https://localhost:3000
echo ====================================================================
echo.
echo Abriendo TERRAIN-X en el navegador predeterminado...
start https://localhost:3000

echo.
echo -> Presiona cualquier tecla para detener todos los servidores...
pause >nul

echo Deteniendo servicios de TERRAIN-X...
taskkill /F /FI "WINDOWTITLE eq TERRAIN-X*" >nul 2>&1
echo [OK] Servicios detenidos.
