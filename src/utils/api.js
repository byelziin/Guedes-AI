function isSameHost(hostname) {
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname.toLowerCase())
}

export function buildApiUrl(path) {
  const apiUrl = String(import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '').trim()
  if (!apiUrl) return path

  const normalized = apiUrl.replace(/\/+$/, '')
  try {
    const target = new URL(normalized)
    const currentHost = window.location.hostname.toLowerCase()
    const targetHost = target.hostname.toLowerCase()

    if (isSameHost(targetHost) || targetHost === currentHost) {
      return path
    }

    return `${normalized}${path.startsWith('/') ? path : `/${path}`}`
  } catch (e) {
    return path
  }
}
