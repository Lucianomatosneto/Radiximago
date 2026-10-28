# Desliga o tunel e volta o Radix ao modo normal (http://localhost:3000).
# Uso (PowerShell, na pasta do projeto):  .\scripts\tunel-desligar.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose -f docker-compose.yml -f docker-compose.tunel.yml rm -s -f radix-cloudflared
docker compose up -d --build
Write-Host ""
Write-Host "Tunel desligado. O Radix voltou para http://localhost:3000" -ForegroundColor Green
