@echo off
cd /d "%~dp0"
start "" http://localhost:3000
npx -y serve -l 3000
