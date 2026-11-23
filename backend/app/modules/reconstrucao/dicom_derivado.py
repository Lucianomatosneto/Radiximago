"""
Grava a panoramica reconstruida e os cortes transversais como DICOM
(pedido do Luciano, 23/11/2026).

- Mesmo ESTUDO da tomografia (StudyInstanceUID e dados do paciente ja
  anonimizados sao copiados do corte de origem); SERIES NOVAS, com UIDs
  novos, para nao misturar com a tomografia original (que nao e alterada).
- SOP "Secondary Capture" (imagem derivada), modalidade "OT" (outra) -
  NAO "PX": nao e uma radiografia panoramica, e uma reconstrucao.
- ImageType DERIVED/SECONDARY; DerivationDescription com os parametros;
  ReferencedSeriesSequence aponta a serie de origem (rastreabilidade).
- PixelSpacing = tamanho do pixel em mm: a regua e o "tamanho real" do
  visualizador funcionam.
- Pixel em 16 bits com sinal, nos mesmos valores da tomografia; a janela
  inicial (WindowCenter/Width) vem dos percentis 1-99,5 da propria imagem.
"""

from __future__ import annotations

import io
from datetime import datetime

import numpy as np
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

# dados do paciente e do estudo copiados do corte de origem (ja anonimizado)
CAMPOS_DO_ESTUDO = (
    "PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
    "PatientIdentityRemoved", "DeidentificationMethod",
    "StudyInstanceUID", "StudyDate", "StudyTime", "StudyID", "AccessionNumber",
    "ReferringPhysicianName", "StudyDescription", "InstitutionName",
)


def _janela(img: np.ndarray) -> tuple[float, float]:
    baixo, alto = np.percentile(img, [1, 99.5])
    largura = max(float(alto - baixo), 1.0)
    return float(baixo + largura / 2), largura


def gerar_instancia(
    origem: Dataset,
    imagem: np.ndarray,
    tamanho_pixel_mm: float,
    serie_uid: str,
    numero_serie: int,
    descricao_serie: str,
    numero_instancia: int,
    descricao_derivacao: str,
    comentario: str = "",
) -> bytes:
    """Um arquivo DICOM (bytes) com a imagem 2D derivada."""
    agora = datetime.now()
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset("derivada.dcm", {}, file_meta=meta, preamble=b"\0" * 128)
    for campo in CAMPOS_DO_ESTUDO:
        if campo in origem:
            setattr(ds, campo, origem.data_element(campo).value)
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.SeriesInstanceUID = serie_uid
    ds.SeriesNumber = numero_serie
    ds.InstanceNumber = numero_instancia
    ds.SeriesDescription = descricao_serie
    ds.Modality = "OT"
    ds.ConversionType = "WSD"  # workstation (gerada por software)
    ds.ImageType = ["DERIVED", "SECONDARY", "RECONSTRUCAO"]
    ds.DerivationDescription = descricao_derivacao[:1024]
    if comentario:
        ds.ImageComments = comentario[:10240]
    ds.SeriesDate = ds.ContentDate = agora.strftime("%Y%m%d")
    ds.SeriesTime = ds.ContentTime = agora.strftime("%H%M%S")
    ds.BurnedInAnnotation = "NO"
    ref = Dataset()
    ref.SeriesInstanceUID = origem.SeriesInstanceUID
    ds.ReferencedSeriesSequence = Sequence([ref])
    pixels = np.clip(np.rint(imagem), -32768, 32767).astype(np.int16)
    ds.Rows, ds.Columns = pixels.shape
    ds.PixelSpacing = [round(float(tamanho_pixel_mm), 6)] * 2
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 16, 15
    ds.PixelRepresentation = 1
    ds.RescaleSlope, ds.RescaleIntercept, ds.RescaleType = 1, 0, "US"
    centro, largura = _janela(pixels)
    ds.WindowCenter, ds.WindowWidth = round(centro, 1), round(largura, 1)
    ds.PixelData = pixels.tobytes()
    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()
