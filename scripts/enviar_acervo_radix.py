"""
ENVIAR O ACERVO CONVERTIDO AO RADIX PELO ENVIO NORMAL (22/11/2026)

Envia os arquivos DICOM gerados por scripts/converter_imagens_publicas.py
pela MESMA rota da tela "Imagens recebidas" (POST /images/upload): cada
arquivo passa pela anonimizacao do Orthanc, recorte de moldura e
verificacao de texto, e cada envio fica na auditoria em nome de quem
entrou. Nunca fala direto com o Orthanc.

Quem roda digita o proprio e-mail, senha e codigo de duas etapas no
terminal (a senha nao aparece na tela e nao e gravada em lugar nenhum).

Respeita o limite do sistema (300 envios por hora por conta): espera
12,5 s entre envios e, se o Radix responder "muitos pedidos" (429), espera
o tempo pedido e tenta de novo. Pode ser interrompido (Ctrl+C) e rodado de
novo: arquivos ja enviados com sucesso sao pulados (convertidos/envio.csv).

So usa a biblioteca padrao do Python.

Uso (PowerShell):
  python scripts/enviar_acervo_radix.py C:/Users/lmnvo/RadixImagens
  python scripts/enviar_acervo_radix.py C:/Users/lmnvo/RadixImagens --tipos periapical,panoramica
"""

import argparse
import csv
import getpass
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

ORDEM_TIPOS = ["periapical", "panoramica", "interproximal", "oclusal", "tomografia"]
INTERVALO_S = 12.5  # 300 por hora


class Sessao:
    def __init__(self, api: str):
        self.api = api.rstrip("/")
        self.cookie = ""

    def _pedir(self, metodo: str, rota: str, corpo: bytes | None, tipo: str | None):
        pedido = urllib.request.Request(self.api + rota, data=corpo, method=metodo)
        if tipo:
            pedido.add_header("Content-Type", tipo)
        if self.cookie:
            pedido.add_header("Cookie", self.cookie)
        try:
            with urllib.request.urlopen(pedido, timeout=180) as resp:
                self._guardar_cookie(resp.headers)
                return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as erro:
            self._guardar_cookie(erro.headers)
            return erro.code, erro.headers, erro.read()

    def _guardar_cookie(self, cabecalhos) -> None:
        for valor in cabecalhos.get_all("Set-Cookie") or []:
            par = valor.split(";", 1)[0]
            if par.startswith("access_token=") and par != "access_token=" and 'access_token=""' not in par:
                self.cookie = par

    def json(self, metodo: str, rota: str, dados: dict | None = None, formulario: dict | None = None):
        if formulario is not None:
            from urllib.parse import urlencode
            corpo, tipo = urlencode(formulario).encode(), "application/x-www-form-urlencoded"
        elif dados is not None:
            corpo, tipo = json.dumps(dados).encode(), "application/json"
        else:
            corpo, tipo = None, None
        status, cab, conteudo = self._pedir(metodo, rota, corpo, tipo)
        try:
            return status, cab, json.loads(conteudo or b"null")
        except ValueError:
            return status, cab, {"detail": conteudo[:200].decode("utf-8", "replace")}

    def enviar_arquivo(self, caminho: str):
        fronteira = uuid.uuid4().hex
        with open(caminho, "rb") as fh:
            conteudo = fh.read()
        corpo = (
            f"--{fronteira}\r\nContent-Disposition: form-data; name=\"arquivo\"; "
            f"filename=\"{os.path.basename(caminho)}\"\r\nContent-Type: application/dicom\r\n\r\n"
        ).encode() + conteudo + f"\r\n--{fronteira}--\r\n".encode()
        status, cab, resposta = self._pedir("POST", "/images/upload", corpo, f"multipart/form-data; boundary={fronteira}")
        try:
            return status, cab, json.loads(resposta or b"null")
        except ValueError:
            return status, cab, {"detail": resposta[:200].decode("utf-8", "replace")}


def entrar(sessao: Sessao) -> None:
    email = input("E-mail da sua conta no Radix: ").strip()
    senha = getpass.getpass("Senha (nao aparece enquanto digita): ")
    status, _, r = sessao.json("POST", "/auth/login", formulario={"username": email, "password": senha})
    del senha
    if status != 200:
        sys.exit(f"Nao foi possivel entrar: {r.get('detail') if isinstance(r, dict) else r}")
    if isinstance(r, dict) and r.get("segundo_fator"):
        if r["segundo_fator"] != "codigo":
            sys.exit("Sua conta ainda precisa cadastrar o login em duas etapas: entre uma vez pela tela do Radix e rode de novo.")
        codigo = input("Codigo de 6 digitos do aplicativo autenticador: ").strip()
        status, _, r = sessao.json("POST", "/auth/login/segundo-fator", dados={"desafio": r["desafio"], "codigo": codigo})
        if status != 200:
            sys.exit(f"Codigo recusado: {r.get('detail') if isinstance(r, dict) else r}")
    if not sessao.cookie:
        sys.exit("Entrou, mas o Radix nao devolveu a sessao (cookie). Nada foi enviado.")
    print("Entrou. Comecando os envios.\n")


def listar_arquivos(pasta: str, tipos: set[str]) -> list[tuple[str, str]]:
    base = os.path.join(pasta, "convertidos")
    arquivos = []
    for tipo in ORDEM_TIPOS:
        if tipos and tipo not in tipos:
            continue
        for caminho in sorted(glob.glob(os.path.join(base, tipo, "**", "*.dcm"), recursive=True)):
            arquivos.append((tipo, caminho))
    return arquivos


def main() -> int:
    parser = argparse.ArgumentParser(description="Envia o acervo convertido ao Radix pelo envio normal.")
    parser.add_argument("pasta", help="pasta de trabalho (com convertidos/)")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--tipos", default="", help="lista separada por virgula (padrao: todos)")
    args = parser.parse_args()

    tipos = {t.strip() for t in args.tipos.split(",") if t.strip()}
    arquivos = listar_arquivos(args.pasta, tipos)
    registro = os.path.join(args.pasta, "convertidos", "envio.csv")
    feitos: dict[str, dict] = {}
    if os.path.exists(registro):
        with open(registro, encoding="utf-8-sig", newline="") as fh:
            feitos = {l["arquivo"]: l for l in csv.DictReader(fh) if l["resultado"] in ("importada", "ja_existente")}
    pendentes = [(t, c) for t, c in arquivos if os.path.relpath(c, args.pasta) not in feitos]
    print(f"{len(arquivos)} arquivo(s); {len(arquivos) - len(pendentes)} ja enviado(s); {len(pendentes)} a enviar.")
    if pendentes:
        minutos = len(pendentes) * INTERVALO_S / 60
        print(f"Tempo estimado: cerca de {minutos:.0f} minuto(s) (limite de 300 envios por hora).\n")
    else:
        return 0

    sessao = Sessao(args.api)
    entrar(sessao)

    novo = not os.path.exists(registro)
    with open(registro, "a", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["arquivo", "tipo", "resultado", "orthanc_reference_id", "detalhe", "quando"])
        if novo:
            w.writeheader()
        for n, (tipo, caminho) in enumerate(pendentes, 1):
            inicio = time.monotonic()
            while True:
                status, cab, r = sessao.enviar_arquivo(caminho)
                if status == 429:
                    espera = int(cab.get("Retry-After") or 120)
                    print(f"  limite do Radix atingido; esperando {espera} s...")
                    time.sleep(espera)
                    continue
                break
            if status == 401:
                sys.exit("A sessao expirou. Rode o comando de novo: os arquivos ja enviados serao pulados.")
            ok = status == 200 and isinstance(r, dict)
            linha = {
                "arquivo": os.path.relpath(caminho, args.pasta), "tipo": tipo,
                "resultado": r.get("status") if ok else f"erro_{status}",
                "orthanc_reference_id": r.get("orthanc_reference_id", "") if ok else "",
                "detalhe": "" if ok else str(r.get("detail") if isinstance(r, dict) else r)[:200],
                "quando": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            w.writerow(linha)
            fh.flush()
            print(f"[{n}/{len(pendentes)}] {linha['arquivo']}: {linha['resultado']} {linha['orthanc_reference_id']} {linha['detalhe']}")
            resto = INTERVALO_S - (time.monotonic() - inicio)
            if resto > 0 and n < len(pendentes):
                time.sleep(resto)
    print(f"\nConcluido. Resultado em {registro}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrompido. Rode de novo para continuar de onde parou.")
        sys.exit(1)
