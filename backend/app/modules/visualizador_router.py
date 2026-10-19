"""
GET /visualizador/autorizar - "portaria" das imagens DICOM.

Quem chama esta rota NAO e a tela do Radix: e o proxy Nginx que fica na
frente do Orthanc (orthanc/cors-proxy.conf.template, diretiva auth_request).
Para cada pedido de imagem do visualizador OHIF, o Nginx pergunta aqui
antes de repassar ao Orthanc, mandando:
- o cookie de login do Radix (o mesmo das outras telas);
- X-Original-URI: o endereco pedido (ex.: /dicom-web/studies/1.2.3/...);
- X-Original-Method: GET, POST, DELETE...

Respostas: 204 = pode; 401 = sem login (ou login expirado); 403 = logado,
mas sem permissao para aquela imagem. As regras estao em
app/core/acesso_imagens.py. Acessos NEGADOS a quem esta logado ficam na
auditoria (acao "acesso_imagem_negado" - OWASP ASVS 16.3.2); os permitidos
nao sao registrados um a um (cada imagem gera varios pedidos).

Fora do limite geral de frequencia (app/core/rate_limit.py): o
visualizador pede um corte por vez, e uma tomografia tem centenas - o
limite cortaria a leitura no meio. A rota so responde "pode/nao pode",
nao devolve imagem nem dado.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.acesso_imagens import classificar_pedido, decidir
from app.core.database import get_db
from app.modules.audit_logs import AuditLog
from app.modules.auth import PERFIS_CURADORIA, obter_usuario_atual
from app.modules.compartilhamentos import CompartilhamentoImagem
from app.modules.curations import Curation, StatusCuradoria
from app.modules.orthanc_references import OrthancReference
from app.modules.users import User

router = APIRouter(prefix="/visualizador", tags=["Visualizador (portaria das imagens)"])


def _perfil(usuario: User) -> str:
    return usuario.perfil.value if hasattr(usuario.perfil, "value") else str(usuario.perfil)


def _uids_permitidos(db: Session, usuario: User, uids: frozenset[str]) -> set[str]:
    """Dentre os estudos pedidos, quais este usuario pode ver."""
    ativos = db.query(OrthancReference.study_instance_uid).filter(
        OrthancReference.study_instance_uid.in_(list(uids)),
        OrthancReference.ativo.is_(True),
    )
    if usuario.perfil in PERFIS_CURADORIA:
        # curador: qualquer estudo cadastrado no Radix (ja anonimizado)
        return {u for (u,) in ativos.all()}
    aprovados = {
        u
        for (u,) in ativos.join(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .filter(Curation.status == StatusCuradoria.APROVADA.value)
        .all()
    }
    compartilhados = {
        u
        for (u,) in ativos.join(Curation, Curation.orthanc_reference_id == OrthancReference.id)
        .join(CompartilhamentoImagem, CompartilhamentoImagem.curation_id == Curation.id)
        .filter(CompartilhamentoImagem.destinatario_id == usuario.id)
        .all()
    }
    return aprovados | compartilhados


@router.get("/autorizar", status_code=204, include_in_schema=False)
def autorizar_imagem(
    x_original_uri: str = Header(default="/"),
    x_original_method: str = Header(default="GET"),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    pedido = classificar_pedido(x_original_uri)
    pode = decidir(_perfil(usuario), x_original_method, pedido, lambda uids: _uids_permitidos(db, usuario, uids))
    if not pode:
        db.add(AuditLog(
            usuario_id=usuario.id,
            acao="acesso_imagem_negado",
            entidade="imagem",
            resultado="negado",
            detalhes=f"{x_original_method[:10]} {x_original_uri[:200]}",
        ))
        db.commit()
        raise HTTPException(status_code=403, detail="Sem permissão para esta imagem.")
    return Response(status_code=204)
