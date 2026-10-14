"""Testes do servico de voz SEM baixar o modelo (modelo falso)."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

import app as servico


class ModeloFalso:
    def __init__(self):
        self.chamadas = []

    def transcribe(self, audio, **kwargs):
        self.chamadas.append(kwargs)
        segs = [SimpleNamespace(text=" Periapical, qualidade boa,"), SimpleNamespace(text=" dente 36. ")]
        return iter(segs), SimpleNamespace(duration=3.2)


def test_transcreve_e_carrega_sob_demanda(monkeypatch):
    falso = ModeloFalso()
    criados = []
    monkeypatch.setattr(servico, "_criar_modelo", lambda: criados.append(1) or falso)
    monkeypatch.setattr(servico, "_modelo", None)
    cliente = TestClient(servico.app)
    assert cliente.get("/saude").json()["carregado"] is False
    r = cliente.post("/transcrever", files={"arquivo": ("a.webm", b"xxxx", "audio/webm")}, data={"prompt": "periapical"})
    assert r.status_code == 200
    assert r.json()["texto"] == "Periapical, qualidade boa, dente 36."
    assert falso.chamadas[0]["language"] == "pt" and falso.chamadas[0]["initial_prompt"] == "periapical"
    assert falso.chamadas[0]["beam_size"] == 5  # texto normal: busca completa
    cliente.post("/transcrever", files={"arquivo": ("a.webm", b"yyyy", "audio/webm")})
    assert criados == [1]  # carregou uma vez so
    assert cliente.get("/saude").json()["carregado"] is True


def test_descarrega_quando_ocioso(monkeypatch):
    monkeypatch.setattr(servico, "_modelo", object())
    monkeypatch.setattr(servico, "_ultimo_uso", 0.0)
    assert servico.descarregar_se_ocioso() is True
    assert servico._modelo is None


def test_audio_vazio_e_grande(monkeypatch):
    monkeypatch.setattr(servico, "_criar_modelo", lambda: ModeloFalso())
    cliente = TestClient(servico.app)
    assert cliente.post("/transcrever", files={"arquivo": ("a.webm", b"", "audio/webm")}).status_code == 400
    grande = b"0" * (servico.TAMANHO_MAXIMO + 10)
    assert cliente.post("/transcrever", files={"arquivo": ("a.webm", grande, "audio/webm")}).status_code == 413


def test_audio_invalido(monkeypatch):
    class Quebra:
        def transcribe(self, *a, **k):
            raise RuntimeError("formato")

    monkeypatch.setattr(servico, "_modelo", Quebra())
    cliente = TestClient(servico.app)
    assert cliente.post("/transcrever", files={"arquivo": ("a.webm", b"zz", "audio/webm")}).status_code == 422


def test_modo_rapido_usa_beam_1(monkeypatch):
    falso = ModeloFalso()
    monkeypatch.setattr(servico, "_criar_modelo", lambda: falso)
    monkeypatch.setattr(servico, "_modelo", None)
    cliente = TestClient(servico.app)
    r = cliente.post("/transcrever", files={"arquivo": ("a.webm", b"xx", "audio/webm")}, data={"rapido": "1"})
    assert r.status_code == 200
    assert falso.chamadas[0]["beam_size"] == 1


def test_aquecer_carrega_o_modelo_uma_vez(monkeypatch):
    criados = []
    monkeypatch.setattr(servico, "_criar_modelo", lambda: criados.append(1) or ModeloFalso())
    monkeypatch.setattr(servico, "_modelo", None)
    cliente = TestClient(servico.app)
    assert cliente.post("/aquecer").json() == {"carregado": True, "ja_estava": False}
    assert cliente.post("/aquecer").json() == {"carregado": True, "ja_estava": True}
    assert criados == [1]
