"""
FOTO -> DICOM (etapa B, 08/11/2026).

O estudante (e o professor) podem enviar a foto de uma radiografia tirada
pela camera do celular, ou uma imagem JPG/PNG do computador. O Radix so
guarda imagens DICOM (o Orthanc e o visualizador OHIF trabalham com DICOM),
entao a foto vira um DICOM de "captura secundaria" (Secondary Capture,
PS3.3 A.8) antes de entrar no MESMO caminho de qualquer imagem: anonimizacao,
leitura de texto gravado na imagem, recorte da moldura e registro.

Cuidados com dados pessoais:
- os METADADOS da foto (EXIF: data, aparelho, localizacao/GPS) sao
  descartados - so os pixels sao copiados para o DICOM novo;
- o DICOM novo nasce sem nenhum dado de paciente ("ANONIMO") e com
  identificadores (UIDs) sorteados;
- texto VISIVEL na propria foto (por exemplo, o nome escrito no filme) e
  tratado pela leitura de texto da entrada e conferido pelo curador.
"""

from __future__ import annotations

import io
from datetime import datetime

from PIL import Image, ImageOps, UnidentifiedImageError
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7"
FORMATOS_ACEITOS = {"JPEG", "PNG", "WEBP"}
# radiografia fotografada: mais que 40 megapixels e desnecessario e pesa
MAX_PIXELS = 40_000_000
MAX_LADO_GUARDADO = 4096


class FotoInvalida(ValueError):
    """A imagem nao pode ser convertida (formato, tamanho ou arquivo corrompido)."""


def e_foto(conteudo: bytes) -> bool:
    """JPG, PNG ou WebP pela assinatura do arquivo (nao pelo nome)."""
    return (
        conteudo[:3] == b"\xff\xd8\xff"
        or conteudo[:8] == b"\x89PNG\r\n\x1a\n"
        or (conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP")
    )


def converter(conteudo: bytes, agora: datetime | None = None, negatoscopio: bool = False) -> bytes:
    """Devolve os bytes de um arquivo DICOM com os pixels da foto, em tons de cinza."""
    try:
        with Image.open(io.BytesIO(conteudo)) as original:
            if original.format not in FORMATOS_ACEITOS:
                raise FotoInvalida("Formato de imagem nao aceito. Envie JPG, PNG ou DICOM.")
            if original.width * original.height > MAX_PIXELS:
                raise FotoInvalida("Imagem grande demais (mais de 40 megapixels).")
            # gira conforme o celular gravou (EXIF) e so DEPOIS descarta o EXIF
            imagem = ImageOps.exif_transpose(original).convert("L")
    except FotoInvalida:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as erro:
        raise FotoInvalida("Arquivo de imagem corrompido ou nao reconhecido.") from erro
    imagem.thumbnail((MAX_LADO_GUARDADO, MAX_LADO_GUARDADO))

    agora = agora or datetime.now()
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = SECONDARY_CAPTURE
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = SECONDARY_CAPTURE
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = "ANONIMO"
    ds.PatientID = "ANONIMO"
    ds.Modality = "OT"
    ds.ConversionType = "WSD"  # estacao de trabalho / captura digital
    ds.SeriesDescription = "Foto de negatoscopio" if negatoscopio else "Foto enviada pelo Radix Imago"
    # sem PixelSpacing de proposito: a foto nao tem escala real (nenhuma
    # medida em milimetros pode ser feita nela)
    ds.ImageComments = "Foto convertida pelo Radix Imago. Sem escala real: nao medir em mm."
    ds.ContentDate = agora.strftime("%Y%m%d")
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows, ds.Columns = imagem.height, imagem.width
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = imagem.tobytes()

    saida = io.BytesIO()
    ds.save_as(saida, enforce_file_format=True)
    return saida.getvalue()
