const DEFAULT_TTL_MS = 20_000
const cache = new Map()
const pending = new Map()

export function getCachedData(key) {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) return null
  return entry.value
}

export function cachedRequest(key, loader, options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS
  const force = Boolean(options.force)
  const cached = !force ? getCachedData(key) : null
  if (cached !== null) return Promise.resolve(cached)

  if (!force && pending.has(key)) return pending.get(key)

  const request = Promise.resolve()
    .then(loader)
    .then(value => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key)
    })

  pending.set(key, request)
  return request
}

export function invalidateCachedData(...keys) {
  keys.flat().filter(Boolean).forEach(key => cache.delete(key))
}

export const scriptFlowCacheKeys = {
  kpiRecords: email => 'kpi-records:' + String(email || '').toLowerCase(),
  forms: email => 'forms:' + String(email || '').toLowerCase(),
  formRecords: (email, formId) => 'form-records:' + String(email || '').toLowerCase() + ':' + String(formId || ''),
  projects: (email, query) => 'kpi-projects:' + String(email || '').toLowerCase() + ':' + String(query || '').trim().toLowerCase()
}
