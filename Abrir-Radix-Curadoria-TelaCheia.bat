@echo off
rem =====================================================================
rem  RADIX IMAGO - abre a CURADORIA ja em TELA CHEIA
rem
rem  O navegador nao deixa um site entrar em tela cheia sozinho (so com
rem  um clique). Este atalho resolve isso abrindo o Chrome JA em tela cheia,
rem  numa janela propria do Radix (sem abas e sem barra de endereco).
rem
rem  - Usa um perfil separado do Chrome (pasta RadixImagoChrome) para o
rem    Chrome aceitar abrir direto em tela cheia. Na PRIMEIRA vez, faca o
rem    login normalmente: ele fica guardado para as proximas.
rem  - Sair da tela cheia: F11.   Fechar a janela: Alt+F4.
rem  - Dica: clique com o botao direito neste arquivo > Enviar para >
rem    Area de trabalho (criar atalho), para abrir com dois cliques.
rem =====================================================================

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  echo Nao encontrei o Google Chrome neste computador.
  pause
  exit /b 1
)

start "" "%CHROME%" --user-data-dir="%LocalAppData%\RadixImagoChrome" --no-first-run --start-fullscreen --app=http://localhost:3000/curadoria
