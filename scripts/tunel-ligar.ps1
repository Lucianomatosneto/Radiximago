# Liga o Radix em modo DEMONSTRACAO PELA INTERNET (Cloudflare Tunnel).
# Uso (PowerShell, na pasta do projeto):  .\scripts\tunel-ligar.ps1
# Depois acesse: https://app.radiximago.com.br
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose -f docker-compose.yml -f docker-compose.tunel.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.tunel.yml ps
Write-Host ""
Write-Host "Pronto. Endereco para compartilhar: https://app.radiximago.com.br" -ForegroundColor Green
Write-Host "Mantenha o computador ligado e o Docker aberto enquanto quiser o link funcionando."
