@echo off
set simmulationfunc=dailysimulation
set simulationstartdate=2026-05-12
set simulationenddate=2026-05-20
"C:\nvm4w\nodejs\node.exe" --max-old-space-size=8192 .\server\server.js --max-old-space-size=8000
