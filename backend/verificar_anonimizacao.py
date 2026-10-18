import pydicom

CAMINHO = "/app/dicom_teste/DICOM/I6"

# Mantida consistente com regras_de_anonimizacao() em
# app/modules/orthanc_client.py (revisao de 18/10/2026): sexo e idade ficam
# (idade 90+ vira "090Y"); datas ficam so com o ano (AAAA0101); horas e a
# sequencia de equipamento saem. Os campos abaixo devem sair VAZIOS ou
# AUSENTES; as datas e a idade sao mostradas a parte para conferencia.
CAMPOS_SENSIVEIS = [
    "StationName",
    "StudyTime",
    "SeriesTime",
    "ContributingEquipmentSequence",
    "PatientName",
    "PatientID",
    "PatientBirthDate",
    "InstitutionName",
    "InstitutionAddress",
    "ReferringPhysicianName",
    "PerformingPhysicianName",
    "OperatorsName",
    "AccessionNumber",
    "DeviceSerialNumber",
]

ds = pydicom.dcmread(CAMINHO)

print("=" * 50)
print("VERIFICACAO DE ANONIMIZACAO - LGPD")
print("Arquivo:", CAMINHO)
print("=" * 50)

for campo in CAMPOS_SENSIVEIS:
    valor = ds.get(campo, "[AUSENTE]")
    if valor == "" or valor is None:
        valor = "[VAZIO]"
    print(f"{campo:28} : {valor}")

print("=" * 50)