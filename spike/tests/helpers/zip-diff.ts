// ADR: see spec/spike-geracao-xlsx.adr.md
import { unzipSync } from 'fflate'

/**
 * Lista partes que diferem byte-a-byte entre dois ZIPs.
 * Diagnóstico bônus — não é gate de aprovação (ver ADR Decisão 4).
 */
export function zipDiff(a: Uint8Array, b: Uint8Array): string[] {
  const partsA = unzipSync(a)
  const partsB = unzipSync(b)

  const allParts = new Set([...Object.keys(partsA), ...Object.keys(partsB)])
  const diffParts: string[] = []

  for (const part of allParts) {
    const dataA = partsA[part]
    const dataB = partsB[part]

    if (!dataA || !dataB) {
      diffParts.push(part)
      continue
    }

    if (dataA.length !== dataB.length) {
      diffParts.push(part)
      continue
    }

    let differs = false
    for (let i = 0; i < dataA.length; i++) {
      if (dataA[i] !== dataB[i]) {
        differs = true
        break
      }
    }
    if (differs) diffParts.push(part)
  }

  return diffParts.sort()
}
