// Codigo do "aplicativo autenticador" (TOTP, RFC 6238) calculado no proprio
// teste, a partir do segredo sorteado pelo script de usuarios de teste.
// Feito com o node:crypto (sem biblioteca nova): HMAC-SHA1, 6 digitos,
// intervalo de 30 s - os mesmos parametros do pyotp usado pelo backend.
import { createHmac } from 'node:crypto'

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32ParaBytes(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, '').toUpperCase()
  let bits = ''
  for (const c of limpo) {
    const v = ALFABETO_BASE32.indexOf(c)
    if (v < 0) throw new Error('segredo TOTP invalido')
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function codigoTotp(segredo: string, instanteMs = Date.now()): string {
  const passo = Math.floor(instanteMs / 1000 / 30)
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(passo))
  const hmac = createHmac('sha1', base32ParaBytes(segredo)).update(contador).digest()
  const deslocamento = hmac[hmac.length - 1] & 0x0f
  const numero = (hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 1_000_000
  return String(numero).padStart(6, '0')
}

/** Segundos que faltam para o codigo atual expirar. */
export function segundosRestantes(instanteMs = Date.now()): number {
  return 30 - (Math.floor(instanteMs / 1000) % 30)
}
