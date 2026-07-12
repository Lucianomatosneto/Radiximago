import pydicom

CAMINHO = "/app/dicom_teste/DICOM/I6"

CAMPOS_SENSIVEIS = [
    "PatientName",
    "PatientID",
    "PatientBirthDate",
    "PatientSex",
    "PatientAge",
    "InstitutionName",
    "InstitutionAddress",
    "ReferringPhysicianName",
    "PerformingPhysicianName",
    "OperatorsName",
    "StudyDate",
    "SeriesDate",
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