"""
Termos de Uso e Politica de Privacidade v1.1 (11/11/2026).

Confere, na versao 1.1, o que a auditoria pediu:
- a versao em vigor e a 1.1;
- quem aceitou a 1.0 precisa aceitar de novo no proximo login (o servidor
  barra tudo com 403 "termos_uso_pendentes" ate o aceite);
- o aceite grava o SHA-256 (resumo de 64 caracteres) do texto exato aceito;
- a pagina publica /termos mostra o texto novo (sem as bases legais
  retiradas e sem mencao institucional).

17/11/2026: com a versao 1.2 (grupos - tests/test_termos_v12.py), estes
testes passam a conferir que o CONTEUDO da 1.1 continua no texto em vigor e
que quem tem um aceite antigo precisa aceitar a versao em vigor.
"""

from datetime import datetime, timezone

from app.modules import termos_uso
from app.modules.termos_uso import CODIGO_PENDENTE, AceiteTermosUso
from app.modules.users import UserRole
from tests.test_termos_uso import _aceitar, _login


def test_quem_aceitou_a_1_0_precisa_aceitar_a_versao_em_vigor_no_proximo_login(criar_usuario, db):
    u = criar_usuario(perfil=UserRole.estudante)
    # aceite antigo, da versao 1.0
    db.add(AceiteTermosUso(usuario_id=u.id, versao="1.0", perfil="estudante", resumo_textos="0" * 64,
                           aceito_em=datetime.now(timezone.utc)))
    db.commit()

    nav = _login(u.email)
    meus = nav.get("/termos/meus").json()
    assert meus["pendente"] is True and meus["primeiro_aceite"] is False
    assert meus["versao"] == termos_uso.TERMOS_VERSAO
    assert nav.get("/search").json()["detail"] == CODIGO_PENDENTE

    assert _aceitar(nav, "estudante", versao="1.0").status_code == 409   # versao velha nao vale
    assert _aceitar(nav, "estudante", versao=termos_uso.TERMOS_VERSAO).status_code == 200
    assert nav.get("/termos/meus").json()["pendente"] is False

    novo = db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == u.id, AceiteTermosUso.versao == termos_uso.TERMOS_VERSAO).one()
    # SHA-256 do texto exato da versao em vigor (64 caracteres hexadecimais)
    assert novo.resumo_textos == termos_uso.resumo_do_perfil("estudante")
    assert len(novo.resumo_textos) == 64 and int(novo.resumo_textos, 16) >= 0
    # o aceite da 1.0 continua guardado (historico, nada e apagado)
    assert db.query(AceiteTermosUso).filter(AceiteTermosUso.usuario_id == u.id).count() == 2


def test_pagina_publica_continua_com_o_conteudo_da_1_1(client):
    d = client.get("/termos").json()
    termos, privacidade = d["termos_uso"], d["privacidade"]
    assert f"**Versão {termos_uso.TERMOS_VERSAO}**" in termos and f"**Versão {termos_uso.TERMOS_VERSAO}**" in privacidade
    # novidades da 1.1
    assert "Desidentificação" in termos and "Imagem anonimizada" in termos
    assert "Código de Defesa do Consumidor, art. 101, I" in termos
    assert "operador" in privacidade and "Resolução CD/ANPD nº 19/2024" in privacidade
    assert "**em até 14 dias**" in privacidade
    # bases legais retiradas (so valiam para pessoa juridica ou orgao de pesquisa)
    assert "Marco Civil, art. 15" not in privacidade
    assert "(art. 7º, IV)" not in privacidade and "art. 16, II" not in privacidade
    # sem mencao institucional
    for texto in [termos, privacidade, *d["perfis"].values()]:
        assert "PPGINFOS" not in texto
