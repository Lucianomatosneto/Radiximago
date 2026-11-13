import enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, text
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
    UFSC = "ufsc"        # chegou por envio direto do equipamento (protocolo DICOM/C-STORE)
    EXTERNA = "externa"  # chegou por upload manual (API REST) - inclusive de fora da UFSC


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
    # "ufsc" ou "externa" (ver OrigemImagem). Registros gravados ANTES desta
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

    curations = relationship("Curation", back_populates="orthanc_reference")


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
