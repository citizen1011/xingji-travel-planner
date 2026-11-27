@echo off
setlocal
cd /d "%~dp0"
where uv >nul 2>&1
if errorlevel 1 (
  echo uv was not found. Install uv and reopen this script.
  pause
  exit /b 1
)
if not exist ".env" (
  copy ".env.local.example" ".env" >nul
  if errorlevel 1 goto failed
)
uv sync --locked --python 3.13
if errorlevel 1 goto failed
echo.
echo Travel planner: http://127.0.0.1:8000/
echo Make sure Ollama is running and qwen2.5:7b is available.
echo.
uv run --locked python -X utf8 -m uvicorn local_entry:api --host 127.0.0.1 --env-file .env
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Startup failed. Check the log above and the README.
pause
exit /b 1
