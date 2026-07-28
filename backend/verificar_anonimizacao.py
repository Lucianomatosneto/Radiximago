import pydicom

CAMINHO = "/app/dicom_teste/DICOM/I6"

# Mantida consistente com _CAMPOS_A_PRESERVAR em app/modules/orthanc_client.py.
# Sexo, idade e data do exame (Study/Series) NAO entram aqui de proposito -
# sao contexto pedagogico util pro fluxo de curadoria e, sozinhos, nao
# identificam um paciente.
CAMPOS_SENSIVEIS = [
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