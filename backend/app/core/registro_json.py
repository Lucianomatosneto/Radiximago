"""
Saida dos registros do servidor em formato padrao, legivel por ferramentas
(OWASP ASVS 16.2.4 - docs/REGISTROS.md).

Cada linha da saida do container vira um objeto JSON com:
  horario (UTC, ISO 8601), nivel, origem (qual parte do sistema), mensagem
  e, em erros, o tipo do erro e o rastro tecnico (so na saida do servidor -
  nunca na resposta ao usuario).
Ferramentas de monitoramento (ex.: Loki, Elastic, Graylog) leem isso sem
adaptacao. Inclui o registro de acesso do uvicorn (ip, metodo, caminho,
codigo).
"""

import json
import logging
from datetime import datetime, timezone


class FormatoJson(logging.Formatter):
    def format(self, registro: logging.LogRecord) -> str:
        dados = {
            "horario": datetime.fromtimestamp(registro.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "nivel": registro.levelname,
            "origem": registro.name,
            "mensagem": registro.getMessage(),
        }
        if registro.exc_info:
            dados["erro"] = registro.exc_info[0].__name__ if registro.exc_info[0] else None
            dados["rastro"] = self.formatException(registro.exc_info)
        return json.dumps(dados, ensure_ascii=False)


def configurar_registros() -> None:
    """Troca o formato de todos os registros (aplicacao e uvicorn) para JSON."""
    saida = logging.StreamHandler()
    saida.setFormatter(FormatoJson())
    raiz = logging.getLogger()
    raiz.handlers = [saida]
    raiz.setLevel(logging.INFO)
    for nome in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        registro = logging.getLogger(nome)
        registro.handlers = [saida]
        registro.propagate = False
