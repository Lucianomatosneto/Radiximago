"""
Rotas das PASTAS DE PACIENTES (ver app/modules/casos.py).

Quem pode ver uma pasta (_pode_ver): o aluno autor, o aluno que recebeu o
tratamento, professores e curadores. Suporte e pesquisador NAO veem. O
administrador (02/11/2026) acompanha fila e tratamentos SEM dados do paciente
("Pasta #N") e so ABRE uma pasta (dados e fotos, somente leitura) depois de
informar o motivo em POST /casos/{id}/justificar-acesso (vale 30 min, so para
essa pasta, fica na auditoria). Toda abertura de pasta e de foto fica na auditoria
(caso_visualizado).

Aluno (e professor/curador, que tambem podem cadastrar):
- GET   /casos/opcoes                 listas (modalidades, generos, tratamentos) + professores
- POST  /casos                        cria a pasta (multipart: dados + fotos + termo)
- GET   /casos/minhas                 pastas que EU criei
- GET   /casos/meus-tratamentos       pacientes encaminhados a MIM para tratar
Todos que podem ver a pasta:
- GET   /casos/{id}                   pasta completa (dados, imagens, anotacoes atuais, historico)
- GET   /casos/{id}/imagens/{img}     foto (decifrada na hora); ?miniatura=1 ; ?baixar=1
- GET   /casos/{id}/revisoes          todas as versoes das anotacoes
- PATCH /casos/{id}/paciente          corrige dados do paciente (fica no historico)
- POST  /casos/{id}/concluir          tratamento concluido (aluno do tratamento, professor, curador)
Professor e curador:
- GET   /casos/recebidos              "Compartilhadas comigo": enviadas a mim ou compartilhadas comigo
- GET   /casos/recebidos/novos        quantas ainda nao abri
- POST  /casos/{id}/revisoes          nova versao das anotacoes (editar depois do envio = nova versao)
- POST  /casos/{id}/compartilhar      com outro professor/curador
- DELETE /casos/{id}/compartilhar/{para_id}  deixar de compartilhar (quem compartilhou,
                                      quem recebeu ou curador)
- POST  /casos/{id}/enviar-link       e-mail SO com o link (exige login), para usuario que pode ver
- POST  /casos/{id}/encaminhar-curador
- GET   /casos/fila                   aguardando classificacao / na fila (filtro por tratamento)
- POST  /casos/{id}/classificar       (curador) tipo(s) de tratamento -> entra na fila
- POST  /casos/{id}/encaminhar-aluno  (professor/curador) -> sai da fila, vai para o aluno
- GET   /casos/tratamentos            alunos e pacientes em tratamento (busca por nome)
- GET   /casos/pessoas                professores/curadores/alunos (id, nome) para escolher
Registro de acessos:
- GET   /casos/{id}/acessos           (professor, curador, administrador)
- GET   /casos/registro-acessos       (administrador, curador, professor) - sem dados do paciente
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.cabecalhos import disposicao_de_arquivo
from app.core.config import settings
from app.core.database import get_db
from app.core.email import enviar_email
from app.core.rate_limit import LIMITE_CASO_LINK_EMAIL, LIMITE_CASO_NOVO, limiter
from app.modules import casos_arquivos as arquivos
from app.modules.audit_logs import AuditLog
from app.modules.auth import obter_usuario_atual
from app.modules.busca_termos import DENTES_VALIDOS
from app.modules.casos import (
    CasoClinico, CasoCompartilhamento, CasoHistorico, CasoImagem, CasoRevisao, EtapaCaso,
    GeneroPaciente, ModalidadeCaso, TipoImagemCaso, TipoTratamento,
)
from app.modules.curation.schemas import Marcacao
from app.modules.users import User, UserRole

router = APIRouter(prefix="/casos", tags=["Pastas de pacientes"])

MAX_FOTOS_POR_PASTA = 30
PERFIS_EQUIPE = {UserRole.professor, UserRole.curador}            # veem todas as pastas
PERFIS_CADASTRO = {UserRole.estudante, UserRole.professor, UserRole.curador}
# Supervisao (02/11/2026): o administrador ACOMPANHA a fila e os tratamentos
# (etapa, aluno, professor, tempo parado) para ver se o fluxo anda e onde ha
# erro, mas SEM dados do paciente (nome, contato, idade, genero, descricao,
# fotos) - minimizacao de dados (LGPD art. 6, III). Cada consulta e auditada.
PERFIS_SUPERVISAO = {UserRole.administrador}
PERFIS_REGISTRO_ACESSOS = {UserRole.administrador, UserRole.curador, UserRole.professor}
JANELA_JUSTIFICATIVA = timedelta(minutes=30)  # administrador: quanto tempo vale a justificativa para abrir uma pasta
JANELA_ABERTURA_PASTA = timedelta(seconds=30)  # uma "abriu a pasta" por pessoa a cada 30 s
JANELA_REGISTRO_FOTO = timedelta(minutes=10)  # uma linha de auditoria por pessoa/pasta a cada 10 min nas fotos


# --- permissoes -----------------------------------------------------------------

def _pode_ver(usuario: User, caso: CasoClinico) -> bool:
    if usuario.perfil in PERFIS_EQUIPE:
        return True
    if usuario.perfil == UserRole.estudante:
        return usuario.id in (caso.aluno_id, caso.aluno_tratamento_id)
    return False


def _supervisao_justificada(db: Session, usuario: User, caso_id: int) -> bool:
    """Administrador so ABRE uma pasta (dados e fotos do paciente) se justificou o motivo
    nos ultimos JANELA_JUSTIFICATIVA (decisao de 02/11/2026). Somente leitura."""
    if usuario.perfil not in PERFIS_SUPERVISAO:
        return False
    return db.query(AuditLog.id).filter(
        AuditLog.usuario_id == usuario.id, AuditLog.entidade == "caso", AuditLog.entidade_id == caso_id,
        AuditLog.acao == "caso_acesso_justificado", AuditLog.resultado == "sucesso",
        AuditLog.criado_em >= datetime.now(timezone.utc) - JANELA_JUSTIFICATIVA).first() is not None


def _exigir_leitura_e_escrita(usuario: User) -> None:
    if usuario.perfil in PERFIS_SUPERVISAO:
        raise HTTPException(status_code=403, detail="Acesso negado para o seu perfil: somente leitura.")


def _exigir_perfil(usuario: User, perfis: set) -> None:
    if usuario.perfil not in perfis:
        raise HTTPException(status_code=403, detail="Acesso negado para o seu perfil.")


def _buscar_caso(db: Session, caso_id: int, usuario: User, acao_negada: str = "caso_acesso_negado") -> CasoClinico:
    caso = db.query(CasoClinico).filter(CasoClinico.id == caso_id).first()
    if not caso or not (_pode_ver(usuario, caso) or _supervisao_justificada(db, usuario, caso_id)):
        # 404 tambem para "existe mas nao e sua" - nao revela que a pasta existe
        if caso:
            db.add(AuditLog(usuario_id=usuario.id, acao=acao_negada, entidade="caso", entidade_id=caso_id,
                            resultado="negado"))
            db.commit()
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")
    return caso


def _perfil(u: User) -> str:
    return u.perfil.value if hasattr(u.perfil, "value") else str(u.perfil)


def _historico(db: Session, caso: CasoClinico, usuario: User, acao: str, detalhes: str | None = None) -> None:
    db.add(CasoHistorico(caso_id=caso.id, usuario_id=usuario.id, acao=acao, detalhes=detalhes))


def _auditar(db: Session, usuario: User, acao: str, caso_id: int | None, detalhes: str | None = None) -> None:
    db.add(AuditLog(usuario_id=usuario.id, acao=acao, entidade="caso", entidade_id=caso_id,
                    resultado="sucesso", detalhes=detalhes))


def _iso(v) -> Optional[str]:
    return v.isoformat() if v else None


def _nome(u: Optional[User]) -> Optional[str]:
    return u.nome if u else None


def _idade(nascimento: date) -> int:
    hoje = date.today()
    return hoje.year - nascimento.year - ((hoje.month, hoje.day) < (nascimento.month, nascimento.day))


# --- esquemas --------------------------------------------------------------------

class DadosPaciente(BaseModel):
    nome: str = Field(min_length=3, max_length=200)
    nascimento: date
    genero: GeneroPaciente
    contato: str = Field(min_length=3, max_length=100)
    prontuario: Optional[str] = Field(default=None, max_length=50)
    observacoes: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("nome", "contato")
    @classmethod
    def _limpo(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Campo obrigatório.")
        return v

    @field_validator("prontuario", "observacoes")
    @classmethod
    def _opcional(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("nascimento")
    @classmethod
    def _nascimento(cls, v: date) -> date:
        if v > date.today() or v.year < 1900:
            raise ValueError("Data de nascimento inválida.")
        return v


class InfoFoto(BaseModel):
    dentes: List[int] = Field(default_factory=list, max_length=52)
    observacao: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("dentes")
    @classmethod
    def _dentes(cls, v: List[int]) -> List[int]:
        invalidos = [d for d in v if d not in DENTES_VALIDOS]
        if invalidos:
            raise ValueError(f"Dente inválido (FDI): {invalidos[0]}")
        return sorted(set(v))

    @field_validator("observacao")
    @classmethod
    def _obs(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None


class DadosNovaPasta(BaseModel):
    paciente: DadosPaciente
    modalidade: ModalidadeCaso
    descricao: str = Field(min_length=3, max_length=8000)
    professor_id: Optional[int] = None
    fotos: List[InfoFoto] = Field(default_factory=list, max_length=MAX_FOTOS_POR_PASTA)

    @field_validator("descricao")
    @classmethod
    def _descricao(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Descreva o caso.")
        return v


class AnotacaoImagemCaso(BaseModel):
    texto: Optional[str] = Field(default=None, max_length=8000)
    marcacoes: List[Marcacao] = Field(default_factory=list, max_length=50)


class NovaRevisao(BaseModel):
    comentario: Optional[str] = Field(default=None, max_length=8000)
    anotacoes: Dict[str, AnotacaoImagemCaso] = Field(default_factory=dict)


class EdicaoPaciente(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=3, max_length=200)
    nascimento: Optional[date] = None
    genero: Optional[GeneroPaciente] = None
    contato: Optional[str] = Field(default=None, min_length=3, max_length=100)
    prontuario: Optional[str] = Field(default=None, max_length=50)
    observacoes: Optional[str] = Field(default=None, max_length=4000)
    modalidade: Optional[ModalidadeCaso] = None
    descricao: Optional[str] = Field(default=None, min_length=3, max_length=8000)

    @field_validator("nascimento")
    @classmethod
    def _nascimento(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and (v > date.today() or v.year < 1900):
            raise ValueError("Data de nascimento inválida.")
        return v


class JustificativaAcesso(BaseModel):
    motivo: str = Field(min_length=10, max_length=300)

    @field_validator("motivo")
    @classmethod
    def _motivo_limpo(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 10:
            raise ValueError("Explique o motivo com pelo menos 10 caracteres.")
        return v


class Destino(BaseModel):
    para_id: int


class Encaminhamento(BaseModel):
    nota: Optional[str] = Field(default=None, max_length=2000)


class Classificacao(BaseModel):
    tratamentos: List[TipoTratamento] = Field(min_length=1, max_length=9)


class EncaminhamentoAluno(BaseModel):
    aluno_id: int
    tratamento: TipoTratamento


# --- serializacao ----------------------------------------------------------------

def _revisao_atual(db: Session, caso_id: int) -> Optional[CasoRevisao]:
    return (db.query(CasoRevisao).filter(CasoRevisao.caso_id == caso_id)
            .order_by(CasoRevisao.versao.desc()).first())


def _dados_revisao(r: CasoRevisao) -> dict:
    return {
        "versao": r.versao, "autor": _nome(r.autor), "autor_perfil": r.autor_perfil,
        "comentario": r.comentario, "anotacoes": r.anotacoes or {}, "criado_em": _iso(r.criado_em),
    }


def _dados_imagem(i: CasoImagem) -> dict:
    return {"id": i.id, "ordem": i.ordem, "tipo": i.tipo, "dentes": i.dentes or [],
            "observacao": i.observacao, "largura": i.largura, "altura": i.altura}


def _resumo(db: Session, caso: CasoClinico, usuario: User, aberta: bool = False) -> dict:
    """Linha das grades/listas: paciente, aluno, etapa e as RADIOGRAFIAS (sem o termo).
    Para o administrador, as listas sao mascaradas; `aberta=True` (pasta aberta com
    justificativa, ja validada por _buscar_caso) devolve imagens e descricao."""
    supervisao = usuario.perfil in PERFIS_SUPERVISAO and not aberta
    radiografias = [] if supervisao else [i for i in caso.imagens if i.tipo == TipoImagemCaso.RADIOGRAFIA.value]
    versoes = db.query(func.count(CasoRevisao.id)).filter(CasoRevisao.caso_id == caso.id).scalar() or 0
    paciente = ({"nome": f"Pasta #{caso.id}", "idade": None, "genero": None, "contato": None} if supervisao else
                {"nome": caso.paciente_nome, "idade": _idade(caso.paciente_nascimento),
                 "genero": caso.paciente_genero, "contato": caso.paciente_contato})
    return {
        "id": caso.id,
        "paciente": paciente,
        "aluno": _nome(caso.aluno),
        "professor": _nome(caso.professor),
        "modalidade": caso.modalidade,
        "descricao": None if supervisao else caso.descricao,
        "etapa": caso.etapa,
        "tratamentos": caso.tratamentos or [],
        "tratamento_escolhido": caso.tratamento_escolhido,
        "aluno_tratamento": _nome(caso.aluno_tratamento),
        "imagens": [_dados_imagem(i) for i in radiografias],
        "versoes": versoes,
        "corrigida": bool(caso.corrigido_em and (not caso.visto_aluno_em or caso.corrigido_em > caso.visto_aluno_em)),
        "criado_em": _iso(caso.criado_em),
        "na_fila_desde": _iso(caso.classificado_em),
        "encaminhado_tratamento_em": _iso(caso.encaminhado_tratamento_em),
    }


# --- cadastro --------------------------------------------------------------------

@router.get("/opcoes")
def opcoes(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    professores = (db.query(User).filter(User.perfil == UserRole.professor, User.ativo.is_(True),
                                         User.bloqueado.is_(False), User.excluido.is_(False))
                   .order_by(User.nome).all())
    return {
        "modalidades": [m.value for m in ModalidadeCaso],
        "generos": [g.value for g in GeneroPaciente],
        "tratamentos": [t.value for t in TipoTratamento],
        "professores": [{"id": p.id, "nome": p.nome} for p in professores],
        "max_fotos": MAX_FOTOS_POR_PASTA,
        "max_foto_mb": arquivos.MAX_FOTO_MB,
    }


async def _ler_upload(arq: UploadFile) -> bytes:
    conteudo = await arq.read(arquivos.MAX_FOTO_MB * 1024 * 1024 + 1)
    if len(conteudo) > arquivos.MAX_FOTO_MB * 1024 * 1024:
        raise arquivos.FotoInvalida(f"Foto maior que {arquivos.MAX_FOTO_MB} MB.")
    return conteudo


@router.post("")
@limiter.limit(LIMITE_CASO_NOVO)
async def criar_pasta(
    request: Request,
    dados: str = Form(..., max_length=200_000),
    fotos: List[UploadFile] = File(..., max_length=MAX_FOTOS_POR_PASTA),
    termo: UploadFile = File(...),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    _exigir_perfil(usuario, PERFIS_CADASTRO)
    try:
        info = DadosNovaPasta.model_validate(json.loads(dados))
    except (ValueError, ValidationError) as erro:
        detalhe = erro.errors()[0]["msg"] if isinstance(erro, ValidationError) else "Dados inválidos."
        raise HTTPException(status_code=422, detail=str(detalhe).replace("Value error, ", ""))
    if not fotos:
        raise HTTPException(status_code=422, detail="Tire ao menos uma foto.")
    if len(fotos) > MAX_FOTOS_POR_PASTA:
        raise HTTPException(status_code=422, detail=f"No máximo {MAX_FOTOS_POR_PASTA} fotos por pasta.")
    if info.fotos and len(info.fotos) != len(fotos):
        raise HTTPException(status_code=422, detail="As informações das fotos não conferem com as fotos enviadas.")

    professor = None
    if info.professor_id is not None:
        professor = (db.query(User).filter(User.id == info.professor_id, User.perfil == UserRole.professor,
                                           User.ativo.is_(True), User.bloqueado.is_(False),
                                           User.excluido.is_(False)).first())
        if not professor:
            raise HTTPException(status_code=422, detail="Professor não encontrado.")

    gravados: list[str] = []
    try:
        preparadas = []
        for indice, arq in enumerate(fotos):
            jpeg, mini, larg, alt = arquivos.preparar_foto(await _ler_upload(arq))
            extra = info.fotos[indice] if info.fotos else InfoFoto()
            preparadas.append((TipoImagemCaso.RADIOGRAFIA.value, jpeg, mini, larg, alt, extra))
        jpeg, mini, larg, alt = arquivos.preparar_foto(await _ler_upload(termo))
        preparadas.append((TipoImagemCaso.TERMO.value, jpeg, mini, larg, alt, InfoFoto()))
    except arquivos.FotoInvalida as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    p = info.paciente
    caso = CasoClinico(
        aluno_id=usuario.id, professor_id=professor.id if professor else None,
        paciente_nome=p.nome, paciente_nascimento=p.nascimento, paciente_genero=p.genero.value,
        paciente_contato=p.contato, paciente_prontuario=p.prontuario, paciente_observacoes=p.observacoes,
        modalidade=info.modalidade.value, descricao=info.descricao, etapa=EtapaCaso.ENVIADO.value,
        tratamentos=[],
    )
    db.add(caso)
    try:
        db.flush()
        for ordem, (tipo, jpeg, mini, larg, alt, extra) in enumerate(preparadas):
            nome_arq = arquivos.gravar(jpeg)
            gravados.append(nome_arq)
            nome_mini = arquivos.gravar(mini)
            gravados.append(nome_mini)
            db.add(CasoImagem(caso_id=caso.id, ordem=ordem, tipo=tipo, arquivo=nome_arq, miniatura=nome_mini,
                              largura=larg, altura=alt, bytes=len(jpeg), dentes=extra.dentes,
                              observacao=extra.observacao))
        destino = f"enviada ao professor {professor.nome}" if professor else "só para o aluno"
        _historico(db, caso, usuario, "pasta_enviada", f"{len(fotos)} foto(s) e o termo; {destino}")
        _auditar(db, usuario, "caso_criado", caso.id, f"{len(fotos)} fotos; professor_id={caso.professor_id}")
        db.commit()
    except Exception:
        db.rollback()
        for nome_arq in gravados:
            arquivos.apagar(nome_arq)
        raise
    db.refresh(caso)
    return _resumo(db, caso, usuario)


@router.get("/minhas")
def minhas_pastas(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    lista = (db.query(CasoClinico).filter(CasoClinico.aluno_id == usuario.id)
             .order_by(CasoClinico.criado_em.desc()).limit(500).all())
    return {"casos": [_resumo(db, c, usuario) for c in lista]}


@router.get("/meus-tratamentos")
def meus_tratamentos(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    lista = (db.query(CasoClinico).filter(CasoClinico.aluno_tratamento_id == usuario.id)
             .order_by(CasoClinico.encaminhado_tratamento_em.desc()).limit(500).all())
    return {"casos": [_resumo(db, c, usuario) for c in lista]}


# --- professor / curador ---------------------------------------------------------

@router.get("/recebidos")
def recebidos(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    compartilhados = db.query(CasoCompartilhamento.caso_id).filter(CasoCompartilhamento.para_id == usuario.id)
    lista = (db.query(CasoClinico)
             .filter(or_(CasoClinico.professor_id == usuario.id, CasoClinico.id.in_(compartilhados.scalar_subquery())))
             .order_by(CasoClinico.criado_em.desc()).limit(500).all())
    vistos = {
        c.caso_id: c.visto_em for c in db.query(CasoCompartilhamento).filter(CasoCompartilhamento.para_id == usuario.id)
    }
    abertos = {
        a.entidade_id for a in db.query(AuditLog.entidade_id).filter(
            AuditLog.usuario_id == usuario.id, AuditLog.acao == "caso_visualizado", AuditLog.entidade == "caso")
    }
    saida = []
    for c in lista:
        item = _resumo(db, c, usuario)
        item["nova"] = c.id not in abertos and not vistos.get(c.id)
        saida.append(item)
    return {"casos": saida}


@router.get("/recebidos/novos")
def recebidos_novos(usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    if usuario.perfil not in PERFIS_EQUIPE:
        return {"quantidade": 0}
    compartilhados = db.query(CasoCompartilhamento.caso_id).filter(CasoCompartilhamento.para_id == usuario.id)
    abertos = db.query(AuditLog.entidade_id).filter(
        AuditLog.usuario_id == usuario.id, AuditLog.acao == "caso_visualizado", AuditLog.entidade == "caso")
    n = (db.query(func.count(CasoClinico.id))
         .filter(or_(CasoClinico.professor_id == usuario.id, CasoClinico.id.in_(compartilhados.scalar_subquery())))
         .filter(CasoClinico.id.notin_(abertos.scalar_subquery())).scalar())
    return {"quantidade": n or 0}


@router.get("/pessoas")
def pessoas(
    perfil: UserRole = Query(...),
    caso_id: Optional[int] = Query(None, ge=1, description="So quem pode ver esta pasta (envio do link)"),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Nomes (sem e-mail) para escolher destinatario/aluno - so a equipe.
    Com `caso_id` (01/11/2026, reteste do QA): so quem PODE ABRIR a pasta -
    o link por e-mail so serve para essas pessoas (para aluno: o autor e o do
    tratamento), e a lista nao oferece quem seria recusado."""
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    if perfil not in (UserRole.professor, UserRole.curador, UserRole.estudante):
        raise HTTPException(status_code=422, detail="Perfil inválido.")
    lista = (db.query(User).filter(User.perfil == perfil, User.ativo.is_(True), User.bloqueado.is_(False),
                                   User.excluido.is_(False)).order_by(User.nome).limit(2000).all())
    if caso_id is not None:
        caso = _buscar_caso(db, caso_id, usuario)
        lista = [u for u in lista if _pode_ver(u, caso)]
    return {"pessoas": [{"id": u.id, "nome": u.nome, "perfil": _perfil(u)} for u in lista if u.id != usuario.id]}


@router.get("/fila")
def fila(
    etapa: Optional[EtapaCaso] = None,
    tratamento: Optional[TipoTratamento] = None,
    modalidade: Optional[ModalidadeCaso] = None,
    busca: Optional[str] = Query(default=None, max_length=100),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Curador: aguardando classificacao + na fila. Professor: na fila (Aguardando tratamento).
    Administrador: a mesma fila, so para supervisao (paciente anonimizado, sem busca por nome)."""
    _exigir_perfil(usuario, PERFIS_EQUIPE | PERFIS_SUPERVISAO)
    supervisao = usuario.perfil in PERFIS_SUPERVISAO
    if supervisao and busca:
        raise HTTPException(status_code=422, detail="A busca por nome de paciente não está disponível para o seu perfil.")
    if supervisao:
        _auditar(db, usuario, "caso_fila_supervisao", None)
        db.commit()
    etapas = [EtapaCaso.AGUARDANDO_CLASSIFICACAO.value, EtapaCaso.NA_FILA.value]
    if etapa is not None:
        if etapa.value not in etapas:
            raise HTTPException(status_code=422, detail="Etapa inválida para a fila.")
        etapas = [etapa.value]
    consulta = db.query(CasoClinico).filter(CasoClinico.etapa.in_(etapas))
    if tratamento is not None:
        consulta = consulta.filter(CasoClinico.tratamentos.any(tratamento.value))
    if modalidade is not None:
        consulta = consulta.filter(CasoClinico.modalidade == modalidade.value)
    if busca and busca.strip():
        consulta = consulta.filter(CasoClinico.paciente_nome.ilike(f"%{busca.strip()}%"))
    lista = consulta.order_by(func.coalesce(CasoClinico.classificado_em, CasoClinico.encaminhado_curador_em).asc()).limit(500).all()
    return {"casos": [_resumo(db, c, usuario) for c in lista]}


@router.get("/tratamentos")
def alunos_e_pacientes(
    busca: Optional[str] = Query(default=None, max_length=100),
    situacao: Optional[str] = Query(default=None, max_length=20, pattern="^(em_tratamento|concluido)$"),
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Alunos e os pacientes que estao tratando - busca pelo nome do aluno OU do paciente.
    Administrador: so supervisao (paciente e contato ocultos; busca so pelo aluno)."""
    _exigir_perfil(usuario, PERFIS_EQUIPE | PERFIS_SUPERVISAO)
    supervisao = usuario.perfil in PERFIS_SUPERVISAO
    if supervisao:
        _auditar(db, usuario, "caso_tratamentos_supervisao", None)
        db.commit()
    etapas = [situacao] if situacao else [EtapaCaso.EM_TRATAMENTO.value, EtapaCaso.CONCLUIDO.value]
    consulta = (db.query(CasoClinico).join(User, User.id == CasoClinico.aluno_tratamento_id)
                .filter(CasoClinico.etapa.in_(etapas)))
    if busca and busca.strip():
        termo = f"%{busca.strip()}%"
        consulta = consulta.filter(User.nome.ilike(termo) if supervisao else
                                   or_(CasoClinico.paciente_nome.ilike(termo), User.nome.ilike(termo)))
    lista = consulta.order_by(User.nome.asc(), CasoClinico.encaminhado_tratamento_em.desc()).limit(1000).all()
    saida = []
    for c in lista:
        saida.append({
            "id": c.id, "aluno": _nome(c.aluno_tratamento), "paciente": f"Pasta #{c.id}" if supervisao else c.paciente_nome,
            "contato": None if supervisao else c.paciente_contato, "tratamento": c.tratamento_escolhido,
            "encaminhado_por": _nome(c.encaminhado_tratamento_por),
            "encaminhado_em": _iso(c.encaminhado_tratamento_em), "situacao": c.etapa,
            "concluido_em": _iso(c.concluido_em),
        })
    return {"tratamentos": saida}


@router.get("/registro-acessos")
def registro_de_acessos(
    caso_id: Optional[int] = None,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """Quem abriu qual pasta e quando. Sem nome do paciente (o administrador
    nao ve dados do paciente) - identifica a pasta pelo numero e pelo aluno."""
    _exigir_perfil(usuario, PERFIS_REGISTRO_ACESSOS)
    consulta = db.query(AuditLog).filter(AuditLog.entidade == "caso")
    if caso_id is not None:
        consulta = consulta.filter(AuditLog.entidade_id == caso_id)
    linhas = consulta.order_by(AuditLog.id.desc()).limit(1000).all()
    ids_usuarios = {a.usuario_id for a in linhas if a.usuario_id}
    ids_casos = {a.entidade_id for a in linhas if a.entidade_id}
    nomes = {u.id: (u.nome, _perfil(u)) for u in db.query(User).filter(User.id.in_(ids_usuarios))} if ids_usuarios else {}
    autores = {}
    if ids_casos:
        for c in db.query(CasoClinico).filter(CasoClinico.id.in_(ids_casos)):
            autores[c.id] = _nome(c.aluno)
    return {"acessos": [{
        "quando": _iso(a.criado_em), "quem": nomes.get(a.usuario_id, (None, None))[0],
        "perfil": nomes.get(a.usuario_id, (None, None))[1], "acao": a.acao, "resultado": a.resultado,
        "caso_id": a.entidade_id, "aluno_autor": autores.get(a.entidade_id), "ip": a.ip,
    } for a in linhas]}


# --- uma pasta -------------------------------------------------------------------

@router.get("/{caso_id}")
def detalhe(caso_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    caso = _buscar_caso(db, caso_id, usuario)
    agora = datetime.now(timezone.utc)
    if usuario.id == caso.aluno_id:
        caso.visto_aluno_em = agora
    db.query(CasoCompartilhamento).filter(CasoCompartilhamento.caso_id == caso.id,
                                          CasoCompartilhamento.para_id == usuario.id,
                                          CasoCompartilhamento.visto_em.is_(None)).update({"visto_em": agora})
    # M6 (01/11/2026): a tela pede a pasta de novo logo depois de cada acao;
    # uma abertura por pessoa a cada JANELA_ABERTURA_PASTA (antes: "abriu a
    # pasta" 2x no mesmo segundo)
    recente = (db.query(AuditLog.id).filter(
        AuditLog.usuario_id == usuario.id, AuditLog.entidade == "caso", AuditLog.entidade_id == caso.id,
        AuditLog.acao == "caso_visualizado",
        AuditLog.criado_em >= agora - JANELA_ABERTURA_PASTA).first())
    if not recente:
        _auditar(db, usuario, "caso_visualizado", caso.id)
    db.commit()
    db.refresh(caso)
    revisao = _revisao_atual(db, caso.id)
    historico = (db.query(CasoHistorico).filter(CasoHistorico.caso_id == caso.id)
                 .order_by(CasoHistorico.id.asc()).all())
    equipe = usuario.perfil in PERFIS_EQUIPE
    linhas_compartilhamento = (
        db.query(CasoCompartilhamento, User).join(User, CasoCompartilhamento.para_id == User.id)
        .filter(CasoCompartilhamento.caso_id == caso.id).order_by(CasoCompartilhamento.id.asc()).all()
    )
    compartilhado_com = [_nome(u) for _, u in linhas_compartilhamento]
    compartilhamentos = [
        {"para_id": u.id, "nome": _nome(u), "pode_remover": equipe and _pode_remover_compartilhamento(usuario, c)}
        for c, u in linhas_compartilhamento
    ]
    return {
        **_resumo(db, caso, usuario, aberta=True),
        "paciente": {
            "nome": caso.paciente_nome, "nascimento": caso.paciente_nascimento.isoformat(),
            "idade": _idade(caso.paciente_nascimento), "genero": caso.paciente_genero,
            "contato": caso.paciente_contato, "prontuario": caso.paciente_prontuario,
            "observacoes": caso.paciente_observacoes,
        },
        "termo": [_dados_imagem(i) for i in caso.imagens if i.tipo == TipoImagemCaso.TERMO.value],
        "revisao": _dados_revisao(revisao) if revisao else None,
        "historico": [{"quando": _iso(h.criado_em), "quem": _nome(h.usuario), "acao": h.acao,
                       "detalhes": h.detalhes} for h in historico],
        "compartilhado_com": compartilhado_com,
        "compartilhamentos": compartilhamentos,
        "nota_encaminhamento": caso.nota_encaminhamento,
        "pode": {
            "revisar": equipe,
            "compartilhar": equipe,
            "encaminhar_curador": equipe and caso.etapa == EtapaCaso.ENVIADO.value,
            "classificar": usuario.perfil == UserRole.curador and caso.etapa in (
                EtapaCaso.AGUARDANDO_CLASSIFICACAO.value, EtapaCaso.NA_FILA.value),
            "encaminhar_aluno": equipe and caso.etapa == EtapaCaso.NA_FILA.value,
            "concluir": caso.etapa == EtapaCaso.EM_TRATAMENTO.value and (
                equipe or usuario.id == caso.aluno_tratamento_id),
            "reabrir_tratamento": equipe and caso.etapa == EtapaCaso.CONCLUIDO.value
            and caso.aluno_tratamento_id is not None,
            "editar_paciente": usuario.perfil not in PERFIS_SUPERVISAO,
        },
    }


@router.get("/{caso_id}/imagens/{imagem_id}")
def foto(
    caso_id: int,
    imagem_id: int,
    miniatura: bool = False,
    baixar: bool = False,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    if baixar:
        _exigir_leitura_e_escrita(usuario)  # administrador so olha; nao baixa a foto do paciente
    caso = _buscar_caso(db, caso_id, usuario)
    imagem = db.query(CasoImagem).filter(CasoImagem.id == imagem_id, CasoImagem.caso_id == caso.id).first()
    if not imagem:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    recente = (db.query(AuditLog.id).filter(
        AuditLog.usuario_id == usuario.id, AuditLog.entidade == "caso", AuditLog.entidade_id == caso.id,
        AuditLog.acao == "caso_visualizado",
        AuditLog.criado_em >= datetime.now(timezone.utc) - JANELA_REGISTRO_FOTO).first())
    if not recente:
        _auditar(db, usuario, "caso_visualizado", caso.id, "fotos")
        db.commit()
    if baixar:
        _auditar(db, usuario, "caso_foto_baixada", caso.id, f"imagem_id={imagem.id}")
        db.commit()
    try:
        conteudo = arquivos.ler(imagem.miniatura if miniatura else imagem.arquivo)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=404, detail="Arquivo da imagem indisponível.")
    nome = f"pasta-{caso.id}-imagem-{imagem.ordem + 1}.jpg"
    return Response(content=conteudo, media_type="image/jpeg", headers={
        "Cache-Control": "private, no-store", "Content-Disposition": disposicao_de_arquivo(nome, baixar=baixar)})


@router.post("/{caso_id}/justificar-acesso")
def justificar_acesso(caso_id: int, dados: JustificativaAcesso, usuario: User = Depends(obter_usuario_atual),
                      db: Session = Depends(get_db)):
    """Administrador: registra o MOTIVO para abrir uma pasta (somente leitura, 30 min).
    Nao escreva dados do paciente no motivo - ele fica na auditoria."""
    _exigir_perfil(usuario, PERFIS_SUPERVISAO)
    if not db.query(CasoClinico.id).filter(CasoClinico.id == caso_id).first():
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")
    _auditar(db, usuario, "caso_acesso_justificado", caso_id, dados.motivo)
    db.commit()
    return {"valido_por_minutos": int(JANELA_JUSTIFICATIVA.total_seconds() // 60)}


@router.get("/{caso_id}/revisoes")
def revisoes(caso_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    caso = _buscar_caso(db, caso_id, usuario)
    lista = db.query(CasoRevisao).filter(CasoRevisao.caso_id == caso.id).order_by(CasoRevisao.versao.desc()).all()
    return {"revisoes": [_dados_revisao(r) for r in lista]}


@router.post("/{caso_id}/revisoes")
def nova_revisao(
    caso_id: int,
    dados: NovaRevisao,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    ids_validos = {str(i.id) for i in caso.imagens if i.tipo == TipoImagemCaso.RADIOGRAFIA.value}
    desconhecidas = [k for k in dados.anotacoes if k not in ids_validos]
    if desconhecidas:
        raise HTTPException(status_code=422, detail="Anotação para uma imagem que não é desta pasta.")
    anotacoes = {}
    for k, a in dados.anotacoes.items():
        texto = (a.texto or "").strip() or None
        if texto or a.marcacoes:
            anotacoes[k] = {"texto": texto, "marcacoes": [m.model_dump(mode="json", exclude_none=True) for m in a.marcacoes]}
    comentario = (dados.comentario or "").strip() or None
    if not anotacoes and not comentario:
        raise HTTPException(status_code=422, detail="Nada para salvar: faça uma marcação ou escreva uma anotação.")
    atual = _revisao_atual(db, caso.id)
    versao = (atual.versao if atual else 0) + 1
    db.add(CasoRevisao(caso_id=caso.id, versao=versao, autor_id=usuario.id, autor_perfil=_perfil(usuario),
                       comentario=comentario, anotacoes=anotacoes))
    caso.corrigido_em = datetime.now(timezone.utc)
    acao = "revisao_editada" if atual else "revisao_enviada"
    _historico(db, caso, usuario, acao, f"versão {versao}")
    _auditar(db, usuario, "caso_revisado", caso.id, f"versao={versao}")
    db.commit()
    return {"versao": versao}


@router.patch("/{caso_id}/paciente")
def editar_paciente(
    caso_id: int,
    dados: EdicaoPaciente,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    _exigir_leitura_e_escrita(usuario)
    caso = _buscar_caso(db, caso_id, usuario)
    campos = {
        "nome": "paciente_nome", "nascimento": "paciente_nascimento", "genero": "paciente_genero",
        "contato": "paciente_contato", "prontuario": "paciente_prontuario",
        "observacoes": "paciente_observacoes", "modalidade": "modalidade", "descricao": "descricao",
    }
    mudados = []
    for chave, coluna in campos.items():
        if chave not in dados.model_fields_set:
            continue
        valor = getattr(dados, chave)
        if hasattr(valor, "value"):
            valor = valor.value
        if isinstance(valor, str):
            valor = " ".join(valor.split()) if chave in ("nome", "contato") else valor.strip()
            valor = valor or None
        if valor is None and chave in ("nome", "nascimento", "genero", "contato", "modalidade", "descricao"):
            raise HTTPException(status_code=422, detail=f"O campo {chave} é obrigatório.")
        if getattr(caso, coluna) != valor:
            setattr(caso, coluna, valor)
            mudados.append(chave)
    if not mudados:
        return {"mudados": []}
    # o historico diz QUAIS campos mudaram e quem mudou - os valores ficam so na pasta
    _historico(db, caso, usuario, "dados_alterados", ", ".join(mudados))
    _auditar(db, usuario, "caso_dados_alterados", caso.id, ", ".join(mudados))
    db.commit()
    return {"mudados": mudados}


@router.post("/{caso_id}/compartilhar")
def compartilhar(caso_id: int, dados: Destino, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    destino = (db.query(User).filter(User.id == dados.para_id, User.perfil.in_(list(PERFIS_EQUIPE)),
                                     User.ativo.is_(True), User.bloqueado.is_(False), User.excluido.is_(False)).first())
    if not destino or destino.id == usuario.id:
        raise HTTPException(status_code=422, detail="Escolha um professor ou curador.")
    ja = db.query(CasoCompartilhamento).filter(CasoCompartilhamento.caso_id == caso.id,
                                               CasoCompartilhamento.para_id == destino.id).first()
    if ja:
        return {"mensagem": "Já estava compartilhada com essa pessoa."}
    db.add(CasoCompartilhamento(caso_id=caso.id, de_id=usuario.id, para_id=destino.id))
    _historico(db, caso, usuario, "pasta_compartilhada", f"com {destino.nome}")
    _auditar(db, usuario, "caso_compartilhado", caso.id, f"para_id={destino.id}")
    db.commit()
    return {"mensagem": f"Compartilhada com {destino.nome}."}


def _pode_remover_compartilhamento(usuario: User, comp: CasoCompartilhamento) -> bool:
    """Quem compartilhou, quem recebeu (tira da propria lista) ou um curador."""
    return usuario.id in (comp.de_id, comp.para_id) or usuario.perfil == UserRole.curador


@router.delete("/{caso_id}/compartilhar/{para_id}")
def deixar_de_compartilhar(caso_id: int, para_id: int, usuario: User = Depends(obter_usuario_atual),
                           db: Session = Depends(get_db)):
    """
    Extra da auditoria do administrador (01/11/2026): desfaz um
    compartilhamento. A pasta sai de "Compartilhadas comigo" da pessoa e ela
    deixa de ser avisada. Professores e curadores continuam podendo abrir a
    pasta pela lista geral (regra de 01/11: a equipe ve todas as pastas).
    Fica no historico da pasta e na auditoria; nada da pasta e apagado.
    """
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    comp = db.query(CasoCompartilhamento).filter(CasoCompartilhamento.caso_id == caso.id,
                                                 CasoCompartilhamento.para_id == para_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Esta pasta não está compartilhada com essa pessoa.")
    if not _pode_remover_compartilhamento(usuario, comp):
        raise HTTPException(
            status_code=403,
            detail="Só quem compartilhou, quem recebeu ou um curador pode desfazer este compartilhamento.",
        )
    pessoa = db.get(User, para_id)
    db.delete(comp)
    _historico(db, caso, usuario, "compartilhamento_removido", f"com {pessoa.nome if pessoa else para_id}")
    _auditar(db, usuario, "caso_compartilhamento_removido", caso.id, f"para_id={para_id}")
    db.commit()
    return {"mensagem": f"Deixou de compartilhar com {pessoa.nome if pessoa else 'essa pessoa'}."}


@router.post("/{caso_id}/enviar-link")
@limiter.limit(LIMITE_CASO_LINK_EMAIL)
def enviar_link(
    request: Request,
    caso_id: int,
    dados: Destino,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """E-mail com SO o link da pasta (nenhum dado do paciente, nenhuma imagem):
    quem recebe precisa entrar no Radix para ver."""
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    destino = (db.query(User).filter(User.id == dados.para_id, User.ativo.is_(True), User.bloqueado.is_(False),
                                     User.excluido.is_(False)).first())
    if not destino or not _pode_ver(destino, caso):
        raise HTTPException(status_code=422, detail="Essa pessoa não tem acesso a esta pasta.")
    link = f"{settings.FRONTEND_URL.rstrip('/')}/casos/{caso.id}"
    corpo = f"""
    <p>Olá, {destino.nome}.</p>
    <p>{usuario.nome} enviou para você uma pasta de paciente do Radix Imago (pasta nº {caso.id}).</p>
    <p><a href="{link}">Abrir a pasta no Radix Imago</a> (é preciso entrar com a sua conta).</p>
    <p style="color:#666;font-size:12px">Por segurança, este e-mail não contém dados do paciente nem imagens.</p>
    """
    try:
        enviar_email(destino.email, f"Pasta de paciente nº {caso.id} - Radix Imago", corpo)
    except Exception:  # noqa: BLE001 - falha de SMTP vira mensagem amigavel
        _auditar(db, usuario, "caso_link_enviado", caso.id, f"falha; para_id={destino.id}")
        db.commit()
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail agora. Tente mais tarde.")
    _auditar(db, usuario, "caso_link_enviado", caso.id, f"para_id={destino.id}")
    db.commit()
    return {"mensagem": f"Link enviado para {destino.nome}."}


# --- fila de tratamento ----------------------------------------------------------

@router.post("/{caso_id}/encaminhar-curador")
def encaminhar_curador(caso_id: int, dados: Encaminhamento, usuario: User = Depends(obter_usuario_atual),
                       db: Session = Depends(get_db)):
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    if caso.etapa != EtapaCaso.ENVIADO.value:
        raise HTTPException(status_code=409, detail="Esta pasta já foi encaminhada.")
    caso.etapa = EtapaCaso.AGUARDANDO_CLASSIFICACAO.value
    caso.encaminhado_curador_por_id = usuario.id
    caso.encaminhado_curador_em = datetime.now(timezone.utc)
    caso.nota_encaminhamento = (dados.nota or "").strip() or None
    _historico(db, caso, usuario, "encaminhada_curador", caso.nota_encaminhamento)
    _auditar(db, usuario, "caso_encaminhado_curador", caso.id)
    db.commit()
    return {"etapa": caso.etapa}


@router.post("/{caso_id}/classificar")
def classificar(caso_id: int, dados: Classificacao, usuario: User = Depends(obter_usuario_atual),
                db: Session = Depends(get_db)):
    _exigir_perfil(usuario, {UserRole.curador})
    caso = _buscar_caso(db, caso_id, usuario)
    if caso.etapa not in (EtapaCaso.AGUARDANDO_CLASSIFICACAO.value, EtapaCaso.NA_FILA.value):
        raise HTTPException(status_code=409, detail="Só se classifica pasta encaminhada ao curador.")
    caso.tratamentos = list(dict.fromkeys(t.value for t in dados.tratamentos))
    caso.classificado_por_id = usuario.id
    if caso.etapa != EtapaCaso.NA_FILA.value:
        caso.classificado_em = datetime.now(timezone.utc)
    caso.etapa = EtapaCaso.NA_FILA.value
    _historico(db, caso, usuario, "classificada", ", ".join(caso.tratamentos))
    _auditar(db, usuario, "caso_classificado", caso.id, ", ".join(caso.tratamentos))
    db.commit()
    return {"etapa": caso.etapa, "tratamentos": caso.tratamentos}


@router.post("/{caso_id}/encaminhar-aluno")
def encaminhar_aluno(caso_id: int, dados: EncaminhamentoAluno, usuario: User = Depends(obter_usuario_atual),
                     db: Session = Depends(get_db)):
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    if caso.etapa != EtapaCaso.NA_FILA.value:
        raise HTTPException(status_code=409, detail="O paciente não está na fila de tratamento.")
    aluno = (db.query(User).filter(User.id == dados.aluno_id, User.perfil == UserRole.estudante, User.ativo.is_(True),
                                   User.bloqueado.is_(False), User.excluido.is_(False)).first())
    if not aluno:
        raise HTTPException(status_code=422, detail="Aluno não encontrado.")
    caso.etapa = EtapaCaso.EM_TRATAMENTO.value
    caso.aluno_tratamento_id = aluno.id
    caso.tratamento_escolhido = dados.tratamento.value
    caso.encaminhado_tratamento_por_id = usuario.id
    caso.encaminhado_tratamento_em = datetime.now(timezone.utc)
    _historico(db, caso, usuario, "encaminhada_aluno", f"{aluno.nome}: {dados.tratamento.value}")
    _auditar(db, usuario, "caso_encaminhado_aluno", caso.id, f"aluno_id={aluno.id}; {dados.tratamento.value}")
    db.commit()
    return {"etapa": caso.etapa}


@router.post("/{caso_id}/concluir")
def concluir(
    caso_id: int,
    dados: Optional[Encaminhamento] = None,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """A tela pede CONFIRMACAO antes (01/11/2026 - QA item 3); `nota`
    opcional vai para o historico da pasta. Desfazer: /reabrir-tratamento."""
    _exigir_leitura_e_escrita(usuario)  # administrador so le
    caso = _buscar_caso(db, caso_id, usuario)
    if caso.etapa != EtapaCaso.EM_TRATAMENTO.value:
        raise HTTPException(status_code=409, detail="Esta pasta não está em tratamento.")
    if usuario.perfil not in PERFIS_EQUIPE and usuario.id != caso.aluno_tratamento_id:
        raise HTTPException(status_code=403, detail="Só o aluno do tratamento ou a equipe concluem.")
    caso.etapa = EtapaCaso.CONCLUIDO.value
    caso.concluido_por_id = usuario.id
    caso.concluido_em = datetime.now(timezone.utc)
    nota = ((dados.nota if dados else None) or "").strip() or None
    _historico(db, caso, usuario, "tratamento_concluido", nota)
    _auditar(db, usuario, "caso_concluido", caso.id)
    db.commit()
    return {"etapa": caso.etapa}


@router.post("/{caso_id}/reabrir-tratamento")
def reabrir_tratamento(
    caso_id: int,
    dados: Optional[Encaminhamento] = None,
    usuario: User = Depends(obter_usuario_atual),
    db: Session = Depends(get_db),
):
    """DESFAZ o "tratamento concluido" (01/11/2026 - QA item 3): volta para
    "em tratamento" com o MESMO aluno. So professor/curador; fica no
    historico e na auditoria."""
    _exigir_perfil(usuario, PERFIS_EQUIPE)
    caso = _buscar_caso(db, caso_id, usuario)
    if caso.etapa != EtapaCaso.CONCLUIDO.value:
        raise HTTPException(status_code=409, detail="Esta pasta não está com o tratamento concluído.")
    if not caso.aluno_tratamento_id:
        raise HTTPException(status_code=409, detail="Esta pasta não tem aluno de tratamento para retomar.")
    caso.etapa = EtapaCaso.EM_TRATAMENTO.value
    caso.concluido_por_id = None
    caso.concluido_em = None
    nota = ((dados.nota if dados else None) or "").strip() or None
    _historico(db, caso, usuario, "tratamento_reaberto", nota)
    _auditar(db, usuario, "caso_tratamento_reaberto", caso.id)
    db.commit()
    return {"etapa": caso.etapa}


@router.get("/{caso_id}/acessos")
def acessos_da_pasta(caso_id: int, usuario: User = Depends(obter_usuario_atual), db: Session = Depends(get_db)):
    _exigir_perfil(usuario, PERFIS_REGISTRO_ACESSOS)
    if not db.query(CasoClinico.id).filter(CasoClinico.id == caso_id).first():
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")
    return registro_de_acessos(caso_id=caso_id, usuario=usuario, db=db)
