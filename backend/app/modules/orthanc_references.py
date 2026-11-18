import enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.core.database import Base


class OrigemImagem(str, enum.Enum):
    """
    De onde a imagem chegou ao Orthanc - descoberto automaticamente (nao e
    escolhido por ninguem) a partir da propria metadata "Origin" que o
    Orthanc guarda de cada instancia (ver _determinar_origem em
    images_router.py). Guardado como texto simples no banco (mesmo padrao
    de curations.py), so o Enum aqui e a lista oficial de valores validos.
    """
    APARELHO = "aparelho"  # chegou por envio direto de um aparelho cadastrado (protocolo DICOM/C-STORE)
    EXTERNA = "externa"    # chegou por envio manual (API REST: tela, arquivo ou foto)

    @classmethod
    def _missing_(cls, valor):
        # Compatibilidade (18/11/2026): o valor antigo "ufsc" foi renomeado
        # para "aparelho" (nome neutro, sem citar instituicao). Links,
        # macros ou pedidos antigos com "ufsc" continuam funcionando.
        if isinstance(valor, str) and valor.strip().lower() == "ufsc":
            return cls.APARELHO
        return None


class DestinoImagem(str, enum.Enum):
    """
    Para onde a imagem enviada vai (etapa B, 08/11/2026):
    - FILA: fila de curadoria (padrao para professor, curador e equipamentos);
    - PESSOAL: so o dono ve, em Minhas imagens ("so para mim" do estudante);
    - ANALISE: so o dono e a pessoa escolhida (professor ou curador), que
      decide colocar na fila de curadoria ou devolver.
    Nenhuma imagem PESSOAL ou em ANALISE aparece na fila, na pesquisa ou no
    banco geral; so o curador publica no banco geral.
    """
    FILA = "fila"
    PESSOAL = "pessoal"
    ANALISE = "analise"


class OrthancReference(Base):
    __tablename__ = "orthanc_references"
    __table_args__ = (
        # fila de curadoria: "primeiro corte da serie" (migracao b2d4f6a8c0e1)
        Index("ix_orthanc_references_volume_serie", "series_instance_uid", "id",
              postgresql_where=text("em_volume")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orthanc_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    study_instance_uid: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    series_instance_uid: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    sop_instance_uid: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    dicomweb_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    anonimizacao_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="aguardando", server_default=text("'aguardando'")
    )
    # "aparelho" ou "externa" (ver OrigemImagem; "ufsc" ate 18/11/2026). Registros gravados ANTES desta
    # coluna existir foram marcados como "externa" por padrao (server_default)
    # - nao ha como descobrir retroativamente a origem real deles, porque a
    # instancia que guardamos e sempre a versao JA ANONIMIZADA, e o Orthanc
    # nao preserva a metadata de origem do original depois da anonimizacao.
    # So imagens recebidas a partir de agora tem a origem detectada de verdade.
    origem: Mapped[str] = mapped_column(String(10), nullable=False, default="externa", server_default=text("'externa'"))
    # Verificacao de texto gravado nos pixels (app/modules/texto_na_imagem.py):
    # "sem_texto", "tarjado" ou "nao_verificado". Vazio (NULL) = imagem
    # recebida antes de a verificacao existir (18/10/2026) - o curador deve
    # conferir a imagem com atencao, como em "nao_verificado".
    texto_na_imagem: Mapped[str | None] = mapped_column(String(20), nullable=True)
    texto_regioes: Mapped[int | None] = mapped_column(Integer, nullable=True)  # quantas tarjas foram aplicadas
    # Recorte da moldura branca na entrada (app/modules/geometria_imagem.py):
    # "recortada", "sem_borda", "incerto" ou "nao_verificado". Vazio (NULL) =
    # imagem recebida antes de 20/10/2026 (ver roteiro recortar_molduras.py).
    enquadramento: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Quanto a imagem ja foi girada pelo curador (0, 90, 180 ou 270, horario,
    # acumulado). O giro e gravado no proprio arquivo; aqui fica so o registro.
    giro_graus: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    criado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # quem enviou (NULL = chegou pelo equipamento em rede ou antes de 08/11/2026)
    enviado_por_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    destino: Mapped[str] = mapped_column(String(10), nullable=False, default=DestinoImagem.FILA.value,
                     server_default=text("'fila'"), index=True)
    analise_destinatario_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    analise_nota: Mapped[str | None] = mapped_column(String(500), nullable=True)   # recado de quem pediu a analise
    analise_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    devolucao_nota: Mapped[str | None] = mapped_column(String(500), nullable=True)  # motivo de quem devolveu
    # de qual aparelho da rede a imagem chegou (etapa D, 08/11/2026)
    # "dicom" (arquivo DICOM, do aparelho ou enviado) ou "foto" (foto/imagem
    # convertida pelo Radix em DICOM de captura secundaria - Fase 1, 10/11/2026)
    formato_entrada: Mapped[str] = mapped_column(String(10), nullable=False, default="dicom", server_default=text("'dicom'"))
    aparelho_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("aparelhos_rede.id"), nullable=True, index=True)
    # Corte de exame em volume (tomografia, ressonancia - 18/11/2026): os
    # cortes da mesma serie aparecem como UM item na fila de curadoria (o
    # primeiro a chegar) e a ficha vale para o exame inteiro. Decidido na
    # entrada pela modalidade DICOM (substituir_instancia.e_corte_de_volume).
    em_volume: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    curations = relationship("Curation", back_populates="orthanc_reference")


def cortes_da_serie(db, ref: "OrthancReference") -> list["OrthancReference"]:
    """Todos os cortes do mesmo exame em volume (a propria ref, se nao for
    de volume). Ordem de chegada."""
    if not ref.em_volume or not ref.series_instance_uid:
        return [ref]
    return (
        db.query(OrthancReference)
        .filter(OrthancReference.em_volume.is_(True),
                OrthancReference.series_instance_uid == ref.series_instance_uid)
        .order_by(OrthancReference.id)
        .all()
    )


def texto_do_exame(cortes: list["OrthancReference"]) -> tuple[str | None, int | None]:
    """
    Resultado da verificacao de texto nos pixels para o EXAME inteiro (pior
    caso entre os cortes): "tarjado" se algum corte foi tarjado (soma das
    tarjas); se nenhum foi tarjado mas algum nao foi verificado, "nao_verificado";
    so "sem_texto" quando todos os cortes foram verificados sem texto.
    Para uma radiografia (1 corte) devolve o resultado dela, sem mudanca.
    """
    if len(cortes) == 1:
        return cortes[0].texto_na_imagem, cortes[0].texto_regioes
    situacoes = [c.texto_na_imagem for c in cortes]
    if "tarjado" in situacoes:
        return "tarjado", sum(c.texto_regioes or 0 for c in cortes if c.texto_na_imagem == "tarjado")
    if any(s != "sem_texto" for s in situacoes):
        return "nao_verificado", None
    return "sem_texto", None


def visivel_para(ref: "OrthancReference", usuario_id: int, perfil: str) -> bool:
    """
    Quem pode ver uma imagem que AINDA NAO esta no banco geral (sem ficha
    aprovada), pelo destino dela (etapa B, 08/11/2026):
    - administrador e suporte: todas;
    - quem enviou: as proprias;
    - destino "analise": tambem a pessoa escolhida para analisar;
    - destino "fila": a curadoria (como sempre foi).
    Imagens "pessoal" e em "analise" nunca aparecem para o restante.
    """
    if perfil in ("administrador", "suporte"):
        return True
    if ref.enviado_por_id == usuario_id:
        return True
    if ref.destino == DestinoImagem.ANALISE.value:
        return ref.analise_destinatario_id == usuario_id
    if ref.destino == DestinoImagem.FILA.value:
        return perfil == "curador"
    return False


# a tabela aparelhos_rede precisa estar registrada sempre que esta for usada
# (chave estrangeira aparelho_id) - inclusive em roteiros avulsos
from app.modules import aparelhos as _aparelhos  # noqa: E402,F401
