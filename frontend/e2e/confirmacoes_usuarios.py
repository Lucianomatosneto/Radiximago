"""
Teste de navegador das CONFIRMACOES da tela Usuarios (01/11/2026 - reteste
do M1 da auditoria do administrador).

Para cada acao perigosa (Bloquear, Encerrar acessos, Redefinir 2 etapas,
Excluir) abre o quadro de confirmacao e fecha de 3 jeitos - "Cancelar", Esc
e clique fora - conferindo que NENHUMA chamada de gravacao vai para a API e
que o usuario continua Ativo. Use SO em ambiente de teste.

Como rodar (com o Radix ligado em localhost:3000/8000), no PowerShell:
  pip install playwright pyotp
  playwright install chromium
  $env:RADIX_ADMIN_EMAIL="..."   # administrador de TESTE, com 2 etapas
  $env:RADIX_ADMIN_SENHA="..."
  $env:RADIX_ADMIN_TOTP="..."    # segredo do aplicativo de 2 etapas
  $env:RADIX_ALVO_EMAIL="..."    # um estudante de TESTE
  python frontend/e2e/confirmacoes_usuarios.py

Resultado conferido em 01/11/2026 (ambiente de teste do Claude Code): 12 de
12 cancelamentos sem nenhuma chamada; confirmar faz 1 PATCH /users/{id}/block.
"""

import asyncio
import os

import pyotp
from playwright.async_api import async_playwright

URL = os.environ.get("RADIX_URL", "http://localhost:3000")
ACOES = ["Bloquear", "Encerrar acessos", "Redefinir 2 etapas", "Excluir"]


async def main() -> None:
    async with async_playwright() as p:
        navegador = await p.chromium.launch()
        pg = await (await navegador.new_context(viewport={"width": 1440, "height": 900})).new_page()
        chamadas: list[str] = []
        pg.on(
            "request",
            lambda r: chamadas.append(f"{r.method} {r.url}")
            if r.method in ("PATCH", "POST", "DELETE") and "/users/" in r.url
            else None,
        )
        await pg.goto(f"{URL}/login")
        await pg.fill("#email", os.environ["RADIX_ADMIN_EMAIL"])
        await pg.fill("input[type=password]", os.environ["RADIX_ADMIN_SENHA"])
        await pg.keyboard.press("Enter")
        await pg.wait_for_selector("#codigo-segundo-fator", timeout=60000)
        await pg.fill("#codigo-segundo-fator", pyotp.TOTP(os.environ["RADIX_ADMIN_TOTP"]).now())
        await pg.keyboard.press("Enter")
        await pg.wait_for_timeout(4000)
        await pg.goto(f"{URL}/usuarios")
        alvo = os.environ["RADIX_ALVO_EMAIL"]
        await pg.wait_for_selector(f"text={alvo}", timeout=90000)
        linha = pg.locator("tr", has_text=alvo)
        falhas = 0
        for acao in ACOES:
            for modo in ("cancelar", "esc", "fora"):
                antes = len(chamadas)
                await linha.get_by_role("button", name=acao, exact=True).click()
                await pg.wait_for_timeout(500)
                if modo == "cancelar":
                    await pg.locator("[role=dialog] button", has_text="Cancelar").click()
                elif modo == "esc":
                    await pg.keyboard.press("Escape")
                else:
                    await pg.mouse.click(30, 30)
                await pg.wait_for_timeout(900)
                ok = (
                    chamadas[antes:] == []
                    and await pg.locator("[role=dialog]").count() == 0
                    and "Ativo" in await linha.inner_text()
                )
                falhas += 0 if ok else 1
                print(f"{'OK    ' if ok else 'FALHOU'} {acao} / {modo}: {chamadas[antes:]}")
        print("RESULTADO:", "todos os cancelamentos sem chamada" if falhas == 0 else f"{falhas} falha(s)")
        await navegador.close()


asyncio.run(main())
