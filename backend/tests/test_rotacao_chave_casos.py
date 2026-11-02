"""Troca da chave das fotos das pastas: simulacao, aplicacao, repeticao e arquivo ilegivel."""
import pytest

from app.modules import casos_rotacao as rot

ANTIGA = "a" * 40
NOVA = "b" * 40


def _gravar(pasta, nome, conteudo, segredo):
    (pasta / nome).write_bytes(rot._cifrar(rot._aes(segredo), conteudo))


def test_simulacao_nao_altera_nada(tmp_path):
    _gravar(tmp_path, "um.rx", b"foto 1", ANTIGA)
    antes = (tmp_path / "um.rx").read_bytes()
    r = rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=False)
    assert r["total"] == 1 and r["a_trocar"] == 1 and r["trocadas"] == 0
    assert (tmp_path / "um.rx").read_bytes() == antes


def test_aplicar_troca_e_pode_repetir(tmp_path):
    _gravar(tmp_path, "um.rx", b"foto 1", ANTIGA)
    _gravar(tmp_path, "dois.rx", b"foto 2", ANTIGA)
    r = rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=True)
    assert r["trocadas"] == 2 and r["ilegiveis"] == []
    assert rot._decifrar(rot._aes(NOVA), (tmp_path / "um.rx").read_bytes()) == b"foto 1"
    assert rot._decifrar(rot._aes(NOVA), (tmp_path / "dois.rx").read_bytes()) == b"foto 2"
    assert list(tmp_path.glob("*.tmp")) == []
    # segunda rodada: nada a fazer, nada quebra
    r2 = rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=True)
    assert r2["trocadas"] == 0 and r2["ja_na_chave_nova"] == 2


def test_retomada_com_arquivos_misturados(tmp_path):
    _gravar(tmp_path, "velho.rx", b"v", ANTIGA)
    _gravar(tmp_path, "novo.rx", b"n", NOVA)
    r = rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=True)
    assert r["trocadas"] == 1 and r["ja_na_chave_nova"] == 1


def test_arquivo_que_nenhuma_chave_abre_nao_e_tocado(tmp_path):
    _gravar(tmp_path, "estranha.rx", b"x", "c" * 40)
    antes = (tmp_path / "estranha.rx").read_bytes()
    r = rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=True)
    assert r["ilegiveis"] == ["estranha.rx"] and r["trocadas"] == 0
    assert (tmp_path / "estranha.rx").read_bytes() == antes


def test_chaves_invalidas(tmp_path):
    with pytest.raises(ValueError):
        rot.rotacionar(tmp_path, ANTIGA, ANTIGA)
    with pytest.raises(ValueError):
        rot.rotacionar(tmp_path, "", NOVA)


def test_compativel_com_o_formato_real_do_sistema(tmp_path, monkeypatch):
    """Um arquivo gravado pelo proprio sistema abre depois da troca, usando a chave nova no .env."""
    from app.core.config import settings
    from app.modules import casos_arquivos as ca
    monkeypatch.setattr(settings, "CASOS_PASTA", str(tmp_path))
    monkeypatch.setattr(settings, "CASOS_CHAVE", ANTIGA)
    nome = ca.gravar(b"conteudo real")
    rot.rotacionar(tmp_path, ANTIGA, NOVA, aplicar=True)
    monkeypatch.setattr(settings, "CASOS_CHAVE", NOVA)
    assert ca.ler(nome) == b"conteudo real"
