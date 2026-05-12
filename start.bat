@echo off
start "Server" cmd /k "cd /d C:\Users\NILE\Documents\analysis\Academic-result-management\server && npm run dev"
timeout /t 3 /nobreak >nul
start "Client" cmd /k "cd /d C:\Users\NILE\Documents\analysis\Academic-result-management\client && npm run dev"
