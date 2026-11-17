"""
Termos de Uso e Politica de Privacidade v1.2 (17/11/2026) - GRUPOS.

Os grupos ampliados (entrada consentida, modo aula e comentarios particulares)
passaram a tratar dados novos: de quais grupos a pessoa participa, convites e
pedidos, e comentarios. Por isso os textos mudam e todos aceitam de novo.
Confere:
- a versao em vigor e a 1.2, com o resumo do que mudou;
- quem aceitou a 1.1 precisa aceitar a 1.2 no proximo acesso;
- os Termos, a Politica e os anexos dos perfis explicam os grupos: entrada so
  com acordo das duas partes, quem ve o que, comentarios particulares, a ficha
  oficial que nao muda e por quanto tempo os dados ficam.
"""

from datetime import datetime, timezone

from app.modules import termos_uso
from app.modules.termos_uso import CODIGO_PENDENTE, AceiteTermosUso
from app.modules.users import UserRole
from tests.test_termos_uso import _aceitar, _login


def test_versao_em_vigor_e_a_1_2():
    assert termos_uso.TERMOS_VERSAO == "1.2"
    assert termos_uso.TERMOS_VIGENCIA == "17/11/2026"
    assert "grupos" in termos_uso.TERMOS_MUDANCAS.lower()
    assert "coment" in termos_uso.TERMOS_MUDANCAS.lower()


def test_quem_aceitou_a_1_1_precisa_aceitar_a_1_2(criar_usuario, db):
    u = criar_usuario(perfil=UserRole.professor)
    db.add(AceiteTermosUso(usuario_id=u.id, versao="1.1", perfil="professor", resumo_textos="0" * 64,
                           aceito_em=datetime.now(timezone.utc)))
    db.commit()
    nav = _login(u.email)
    meus = nav.get("/termos/meus").json()
    assert meus["pendente"] is True and meus["versao"] == "1.2" and "grupos" in meus["mudancas"].lower()
    assert nav.get("/grupos").json()["detail"] == CODIGO_PENDENTE
    assert _aceitar(nav, "professor", versao="1.1").status_code == 409
    assert _aceitar(nav, "professor", versao="1.2").status_code == 200


def test_textos_explicam_os_grupos(client):
    d = client.get("/termos").json()
    termos, privacidade, perfis = d["termos_uso"], d["privacidade"], d["perfis"]
    assert "**Versão 1.2**" in termos and "**Versão 1.2**" in privacidade

    # Termos: entrada com acordo das duas partes, comentarios particulares, ficha oficial intacta
    assert "aceita um convite" in termos and "autoriza o seu pedido" in termos
    assert "comentários em imagens de grupo" in termos.lower()
    assert "não alteram a ficha oficial" in termos
    assert "nome de grupo, mensagem ou comentário" in termos

    # Politica: dado tratado, quem ve e por quanto tempo
    assert "Participação em grupos" in privacidade
    assert "participantes não veem uns aos outros" in privacidade
    assert "só o nome do grupo e quem o criou" in privacidade
    assert "vencem em 30 dias" in privacidade
    assert "Comentários em imagens de grupo" in privacidade

    # Anexos dos perfis
    assert "pedir para entrar" in perfis["estudante"]
    for perfil in ("professor", "pesquisador", "curador"):
        assert "modo aula" in perfis[perfil].lower(), perfil
        assert "ninguém entra sem concordar" in perfis[perfil], perfil
