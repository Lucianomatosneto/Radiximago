"""
ROTEIRO manter_somente_acervo.py (pedido do Luciano, 23/11/2026): "as
imagens antigas nao foram retiradas do Radix; preciso que fiquem somente as
ultimas que jogamos" (acervo da avaliacao: periapicais, interproximais,
panoramicas, oclusais e duas tomografias).

Regras (tarefa do acervo, 22/11/2026): nada e apagado "na forca" - as
antigas sao DESATIVADAS pelo mesmo caminho da tela (desativacao logica,
ativo=false, com auditoria "desativacao_imagem" de cada uma, reversivel
com /images/{id}/activate). Primeiro SIMULA; so grava com --aplicar.
- a lista do que FICA vem do envio.csv do acervo (resultado importada ou
  ja_existente) ou de um arquivo com um ID por linha;
- tomografia: o exame inteiro fica (todos os cortes), e um exame antigo e
  desativado inteiro, com UM registro de auditoria;
- quem aplica e um administrador (o e-mail dele vai na auditoria);
- lista vazia ou que nao acha nenhuma imagem: para sem mexer em nada.
"""

import pytest

from app.modules.audit_logs import AuditLog
from app.modules.orthanc_references import OrthancReference
from app.modules.users import UserRole


@pytest.fixture()
def roteiro():
    import manter_somente_acervo

    return manter_somente_acervo


def _volume(criar_referencia, db, n=3):
    cortes = [criar_referencia() for _ in range(n)]
    for c in cortes:
        c.em_volume = True
        c.series_instance_uid = f"serie-tc-{cortes[0].id}"
    db.commit()
    return cortes


def _csv(tmp_path, linhas):
    arquivo = tmp_path / "envio.csv"
    arquivo.write_text(
        "﻿arquivo,tipo,resultado,orthanc_reference_id,detalhe,quando\n"
        + "\n".join(f"x{i}.dcm,{t},{r},{rid},,2026-11-22" for i, (t, r, rid) in enumerate(linhas)),
        encoding="utf-8",
    )
    return arquivo


def test_le_os_ids_do_envio_csv(roteiro, tmp_path):
    arquivo = _csv(tmp_path, [("periapical", "erro_403", ""), ("periapical", "importada", 10),
                              ("panoramica", "ja_existente", 11), ("panoramica", "importada", 11)])
    assert roteiro.ler_ids_a_manter(str(arquivo)) == {10, 11}
    lista = tmp_path / "ids.txt"
    lista.write_text("5\n6\n\n7\n", encoding="utf-8")
    assert roteiro.ler_ids_a_manter(str(lista)) == {5, 6, 7}


def test_simulacao_nao_altera_nada(roteiro, criar_referencia, criar_usuario, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    nova, antiga = criar_referencia(), criar_referencia()
    resumo = roteiro.executar(db, {nova.id}, adm.email, aplicar=False)
    assert resumo["manter"] == 1
    assert antiga.id in resumo["desativar"]
    db.expire_all()
    assert db.get(OrthancReference, antiga.id).ativo is True


def test_aplicar_desativa_as_antigas_e_mantem_o_acervo(roteiro, criar_referencia, criar_usuario, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    nova = criar_referencia()
    tc_nova = _volume(criar_referencia, db)
    antiga = criar_referencia()
    tc_antiga = _volume(criar_referencia, db, n=4)
    # do acervo: a radiografia e SO o 1o corte da tomografia (o exame inteiro fica)
    resumo = roteiro.executar(db, {nova.id, tc_nova[0].id}, adm.email, aplicar=True)
    db.expire_all()
    assert db.get(OrthancReference, nova.id).ativo is True
    assert all(db.get(OrthancReference, c.id).ativo for c in tc_nova)
    assert db.get(OrthancReference, antiga.id).ativo is False
    assert not any(db.get(OrthancReference, c.id).ativo for c in tc_antiga)
    # um registro por exame (a tomografia antiga conta uma vez), em nome do administrador
    logs = db.query(AuditLog).filter(AuditLog.acao == "desativacao_imagem", AuditLog.usuario_id == adm.id).all()
    assert sorted(l.entidade_id for l in logs) == sorted([antiga.id, tc_antiga[0].id])
    assert resumo["exames_desativados"] == 2


def test_so_administrador(roteiro, criar_referencia, criar_usuario, db):
    curador = criar_usuario(perfil=UserRole.curador)
    ref = criar_referencia()
    with pytest.raises(SystemExit):
        roteiro.executar(db, {ref.id}, curador.email, aplicar=True)
    with pytest.raises(SystemExit):
        roteiro.executar(db, {ref.id}, "ninguem@exemplo.test", aplicar=True)


def test_lista_que_nao_acha_nada_para_sem_mexer(roteiro, criar_referencia, criar_usuario, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    antiga = criar_referencia()
    for vazia in (set(), {999999999}):
        with pytest.raises(SystemExit):
            roteiro.executar(db, vazia, adm.email, aplicar=True)
    db.expire_all()
    assert db.get(OrthancReference, antiga.id).ativo is True


def test_ids_do_acervo_que_nao_existem_sao_avisados(roteiro, criar_referencia, criar_usuario, db):
    adm = criar_usuario(perfil=UserRole.administrador)
    nova = criar_referencia()
    resumo = roteiro.executar(db, {nova.id, 999999998}, adm.email, aplicar=False)
    assert resumo["nao_encontradas"] == [999999998]
