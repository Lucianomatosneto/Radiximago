"""
CONVERTER IMAGENS DE BASES PUBLICAS PARA DICOM (22/11/2026)

Ferramenta de uso local (fora do sistema): transforma as imagens de bases
publicas com licenca aberta, escolhidas para o acervo da avaliacao com
docentes, em arquivos DICOM que o Radix aceita no envio normal (tela
"Enviar imagem" / POST /api/images/upload). O Radix continua fazendo tudo o
que ja faz com qualquer arquivo recebido: anonimizacao no Orthanc, recorte
da moldura e verificacao de texto nos pixels. Esta ferramenta NUNCA envia
nada ao Orthanc.

Entrada: a pasta de trabalho (ex.: C:/Users/lmnvo/RadixImagens) com
  manifesto.csv            - uma linha por arquivo (arquivo_original, tipo,
                             doi, licenca, uso_permitido, sha256...)
  originais/<tipo>/...     - os arquivos baixados
Saida:  convertidos/<tipo>/... - os DICOM gerados (fora do Git!)
        convertidos/conversao.csv - de-para arquivo original -> DICOM

Tipos:
  periapical, interproximal, oclusal -> Modality IO (Secondary Capture)
  panoramica                         -> Modality PX (Secondary Capture)
  tomografia (volume NIfTI)          -> Modality CT, uma serie com 1 corte
                                        por arquivo (CT Image Storage)

Os UIDs sao CALCULADOS a partir do hash do arquivo original: converter de
novo o mesmo arquivo gera o mesmo DICOM, e o Radix reconhece o reenvio como
imagem ja existente (nao duplica).

A marcacao de uso (acervo / somente pesquisa / sintetica) e a licenca vao
em StudyDescription, SeriesDescription e ImageComments. Pode ser que a
anonimizacao do Radix (perfil basico PS3.15) apague esses campos: nesse
caso a marcacao fica no manifesto e na observacao da curadoria.

Dependencias (so desta ferramenta, nao do sistema): pydicom, numpy, pillow
e, para tomografia, nibabel.

Uso:
  python scripts/converter_imagens_publicas.py C:/Users/lmnvo/RadixImagens
  python scripts/converter_imagens_publicas.py C:/Users/lmnvo/RadixImagens --tipos periapical,panoramica
"""

import argparse
import csv
import datetime
import os
import sys

import numpy as np
from PIL import Image
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, PYDICOM_IMPLEMENTATION_UID, generate_uid

SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7"
CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2"

TIPOS_2D = {
    # tipo: (Modality, sigla, descricao do exame)
    "periapical": ("IO", "PA", "Radiografia periapical"),
    "interproximal": ("IO", "BW", "Radiografia interproximal (bite-wing)"),
    "oclusal": ("IO", "OC", "Radiografia oclusal"),
    "panoramica": ("PX", "PN", "Radiografia panoramica"),
}

MARCACAO_USO = {
    "acervo": "ACERVO",
    "somente_pesquisa": "SOMENTE PESQUISA - NAO COMERCIAL",
    "sintetica": "SINTETICA (IA) - SOMENTE PESQUISA",
}

# niveis de cinza usados para gravar os volumes normalizados (0..1)
CT_MAXIMO = 4095


def uid_estavel(*partes: str) -> str:
    """UID calculado (sempre o mesmo para as mesmas partes)."""
    return generate_uid(entropy_srcs=["radix-acervo-publico", *partes])


def ler_manifesto(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def texto_marcacao(linha: dict) -> str:
    uso = MARCACAO_USO.get(linha["uso_permitido"], linha["uso_permitido"].upper())
    return f"{uso} | {linha['licenca']} | doi:{linha['doi']}"


def _cabecalho_comum(ds: Dataset, linha: dict, modalidade: str, sigla: str, numero: int,
                     descricao: str, uid_estudo: str, uid_serie: str) -> None:
    hoje = datetime.date.today().strftime("%Y%m%d")
    ds.PatientName = f"ACERVO PUBLICO^{sigla} {numero:02d}"
    ds.PatientID = f"ACV-{sigla}-{numero:02d}"
    ds.PatientBirthDate = ""
    ds.PatientSex = ""
    ds.StudyInstanceUID = uid_estudo
    ds.SeriesInstanceUID = uid_serie
    ds.StudyID = f"{sigla}{numero:02d}"
    ds.AccessionNumber = ""
    ds.ReferringPhysicianName = ""
    ds.StudyDate = ds.SeriesDate = ds.ContentDate = hoje
    ds.StudyTime = ds.SeriesTime = ds.ContentTime = "000000"
    ds.Modality = modalidade
    ds.SeriesNumber = 1
    marcacao = texto_marcacao(linha)
    uso = MARCACAO_USO.get(linha["uso_permitido"], linha["uso_permitido"].upper())
    # campos LO: no maximo 64 caracteres
    ds.StudyDescription = descricao[:64]
    ds.SeriesDescription = f"{uso} | {linha['licenca']}"[:64]
    ds.ImageComments = (f"Uso: {marcacao}. Origem: base publica, arquivo {linha['arquivo_original']}, "
                        f"sha256 {linha['sha256'][:16]}.")[:10240]
    ds.Manufacturer = "Base publica (ver ImageComments)"
    ds.PatientOrientation = ""
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelRepresentation = 0


def _meta(ds: Dataset, sop_class: str) -> None:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = sop_class
    meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.ImplementationClassUID = PYDICOM_IMPLEMENTATION_UID
    ds.file_meta = meta


def imagem_cinza_8bits(caminho: str) -> np.ndarray:
    """Abre JPG/PNG/TIFF e devolve uma matriz 8 bits em tons de cinza."""
    with Image.open(caminho) as im:
        if im.mode in ("RGBA", "LA"):
            fundo = Image.new("RGBA", im.size, (0, 0, 0, 255))
            im = Image.alpha_composite(fundo, im.convert("RGBA"))
        if im.mode in ("I;16", "I;16B", "I"):
            matriz = np.asarray(im, dtype=np.float64)
            matriz = (matriz - matriz.min()) / max(np.ptp(matriz), 1) * 255
            return matriz.astype(np.uint8)
        return np.asarray(im.convert("L"), dtype=np.uint8)


def converter_2d(linha: dict, numero: int, origem: str, destino_dir: str) -> list[tuple[str, str]]:
    modalidade, sigla, descricao = TIPOS_2D[linha["tipo"]]
    pixels = imagem_cinza_8bits(origem)
    ds = Dataset()
    _cabecalho_comum(ds, linha, modalidade, sigla, numero, descricao,
                     uid_estavel(linha["sha256"], "estudo"), uid_estavel(linha["sha256"], "serie"))
    ds.SOPClassUID = SECONDARY_CAPTURE
    ds.SOPInstanceUID = uid_estavel(linha["sha256"], "instancia")
    ds.ConversionType = "WSD"
    ds.InstanceNumber = 1
    ds.BurnedInAnnotation = "YES" if linha["tipo"] == "panoramica" else "NO"
    ds.Rows, ds.Columns = pixels.shape
    ds.BitsAllocated = ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelData = np.ascontiguousarray(pixels).tobytes()
    _meta(ds, SECONDARY_CAPTURE)
    nome = f"{sigla}{numero:02d}_{os.path.splitext(linha['arquivo_original'])[0]}"
    if linha["uso_permitido"] == "sintetica" and "SINTETICA" not in nome.upper():
        nome = f"SINTETICA_{nome}"
    saida = os.path.join(destino_dir, nome + ".dcm")
    ds.save_as(saida, enforce_file_format=True)
    return [(saida, ds.SOPInstanceUID)]


def converter_volume(linha: dict, numero: int, origem: str, destino_dir: str) -> list[tuple[str, str]]:
    """
    Volume NIfTI -> serie DICOM CT, um arquivo por corte axial.
    Posicao de cada corte calculada pela matriz (affine) do NIfTI,
    convertida de RAS (NIfTI) para LPS (DICOM).
    """
    import nibabel as nib

    vol = nib.load(origem)
    dados = np.asarray(vol.dataobj, dtype=np.float64)
    if dados.ndim != 3:
        raise ValueError(f"{origem}: esperado volume 3D, veio {dados.shape}")
    minimo, maximo = float(np.nanmin(dados)), float(np.nanmax(dados))
    escala = CT_MAXIMO / (maximo - minimo) if maximo > minimo else 1.0
    inteiros = np.clip(np.rint((dados - minimo) * escala), 0, CT_MAXIMO).astype(np.uint16)

    afim = vol.affine.copy()
    afim[:2, :] *= -1  # RAS -> LPS
    eixo_i, eixo_j, eixo_k = (afim[:3, n] for n in range(3))
    esp_i, esp_j, esp_k = (float(np.linalg.norm(v)) for v in (eixo_i, eixo_j, eixo_k))
    dir_linha, dir_coluna = eixo_i / esp_i, eixo_j / esp_j

    uid_estudo = uid_estavel(linha["sha256"], "estudo")
    uid_serie = uid_estavel(linha["sha256"], "serie")
    uid_referencia = uid_estavel(linha["sha256"], "referencia")
    sub = os.path.join(destino_dir, f"TC{numero:02d}_{linha['arquivo_original'].split('.')[0]}")
    os.makedirs(sub, exist_ok=True)
    gerados = []
    total = inteiros.shape[2]
    for k in range(total):
        ds = Dataset()
        _cabecalho_comum(ds, linha, "CT", "TC", numero, "Tomografia odontologica (TCFC/CBCT)",
                         uid_estudo, uid_serie)
        ds.SOPClassUID = CT_IMAGE_STORAGE
        ds.SOPInstanceUID = uid_estavel(linha["sha256"], "corte", str(k))
        ds.FrameOfReferenceUID = uid_referencia
        ds.PositionReferenceIndicator = ""
        ds.ImageType = ["DERIVED", "SECONDARY", "AXIAL"]
        ds.InstanceNumber = k + 1
        posicao = afim[:3, :3] @ np.array([0.0, 0.0, float(k)]) + afim[:3, 3]
        # "+ 0.0" evita gravar "-0.0"
        ds.ImagePositionPatient = [round(float(v), 4) + 0.0 for v in posicao]
        ds.ImageOrientationPatient = [round(float(v), 6) + 0.0 for v in (*dir_linha, *dir_coluna)]
        ds.SliceLocation = round(float(posicao[2]), 4)
        ds.PixelSpacing = [round(esp_j, 6), round(esp_i, 6)]  # [entre linhas, entre colunas]
        ds.SliceThickness = round(esp_k, 6)
        ds.KVP = ""
        ds.AcquisitionNumber = 1
        ds.RescaleIntercept = 0
        ds.RescaleSlope = 1
        ds.RescaleType = "US"  # intensidade normalizada pela base, nao e HU
        ds.WindowCenter = CT_MAXIMO // 2
        ds.WindowWidth = CT_MAXIMO
        corte = inteiros[:, :, k].T  # linhas = eixo j, colunas = eixo i
        ds.Rows, ds.Columns = corte.shape
        ds.BitsAllocated = 16
        ds.BitsStored = 12
        ds.HighBit = 11
        ds.PixelData = np.ascontiguousarray(corte).tobytes()
        _meta(ds, CT_IMAGE_STORAGE)
        saida = os.path.join(sub, f"corte_{k + 1:04d}.dcm")
        ds.save_as(saida, enforce_file_format=True)
        gerados.append((saida, ds.SOPInstanceUID))
    return gerados


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("pasta", help="pasta de trabalho com manifesto.csv e originais/")
    parser.add_argument("--tipos", default="", help="lista separada por virgula (padrao: todos)")
    args = parser.parse_args()

    linhas = ler_manifesto(os.path.join(args.pasta, "manifesto.csv"))
    tipos = {t.strip() for t in args.tipos.split(",") if t.strip()}
    contador: dict[str, int] = {}
    relatorio = []
    for linha in linhas:
        tipo = linha["tipo"]
        contador[tipo] = contador.get(tipo, 0) + 1
        if tipos and tipo not in tipos:
            continue
        origem = os.path.join(args.pasta, "originais", tipo, linha["arquivo_original"])
        destino_dir = os.path.join(args.pasta, "convertidos", tipo)
        os.makedirs(destino_dir, exist_ok=True)
        if tipo == "tomografia":
            gerados = converter_volume(linha, contador[tipo], origem, destino_dir)
        elif tipo in TIPOS_2D:
            gerados = converter_2d(linha, contador[tipo], origem, destino_dir)
        else:
            print(f"tipo desconhecido, ignorado: {tipo} ({linha['arquivo_original']})", file=sys.stderr)
            continue
        print(f"{tipo:14s} {linha['arquivo_original']:28s} -> {len(gerados)} arquivo(s) DICOM")
        relatorio.append({
            "arquivo_original": linha["arquivo_original"], "tipo": tipo,
            "dicom": os.path.relpath(gerados[0][0], args.pasta) if len(gerados) == 1
            else os.path.relpath(os.path.dirname(gerados[0][0]), args.pasta),
            "arquivos": len(gerados),
        })

    caminho_rel = os.path.join(args.pasta, "convertidos", "conversao.csv")
    os.makedirs(os.path.dirname(caminho_rel), exist_ok=True)
    # conversao parcial (--tipos): mantem as linhas dos outros arquivos
    if os.path.exists(caminho_rel):
        refeitos = {(r["tipo"], r["arquivo_original"]) for r in relatorio}
        with open(caminho_rel, encoding="utf-8-sig", newline="") as fh:
            anteriores = [r for r in csv.DictReader(fh) if (r["tipo"], r["arquivo_original"]) not in refeitos]
        relatorio = anteriores + relatorio
    with open(caminho_rel, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=["arquivo_original", "tipo", "dicom", "arquivos"])
        w.writeheader()
        w.writerows(relatorio)
    print(f"\n{len(relatorio)} origem(ns) convertida(s). De-para em {caminho_rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
