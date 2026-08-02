export function normalizeContact(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return digits
  if (digits.length >= 12 && digits.length <= 13) return digits
  return digits
}

function splitByFixedSize(rawDigits, size) {
  const safeSize = Number.parseInt(String(size || ''), 10)
  if (!Number.isFinite(safeSize) || safeSize <= 0) return []
  if (rawDigits.length < safeSize) return []

  const out = []
  for (let i = 0; i + safeSize <= rawDigits.length; i += safeSize) {
    const slice = rawDigits.slice(i, i + safeSize)
    if (slice.length === safeSize) out.push(slice)
  }
  return out
}

export function extractContactsFromText(text, size) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const lines = raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  const extracted = []

  for (const line of lines.length ? lines : [raw]) {
    const digits = normalizeContact(line)
    if (!digits) continue

    if (digits.length <= 13) {
      extracted.push(digits)
      continue
    }

    const regexDigits = digits.match(/55\d{11}|\d{11}|\d{10}/g) || []
    if (regexDigits.length > 1) {
      extracted.push(...regexDigits.map(normalizeContact).filter(Boolean))
      continue
    }

    const explicitSplit = splitByFixedSize(digits, size)
    if (explicitSplit.length) {
      extracted.push(...explicitSplit.map(normalizeContact).filter(Boolean))
      continue
    }

    const split13 = splitByFixedSize(digits, 13)
    if (split13.length) {
      extracted.push(...split13.map(normalizeContact).filter(Boolean))
      continue
    }

    const split11 = splitByFixedSize(digits, 11)
    if (split11.length) {
      extracted.push(...split11.map(normalizeContact).filter(Boolean))
      continue
    }

    const split10 = splitByFixedSize(digits, 10)
    if (split10.length) extracted.push(...split10.map(normalizeContact).filter(Boolean))
  }

  return extracted.filter(Boolean)
}
