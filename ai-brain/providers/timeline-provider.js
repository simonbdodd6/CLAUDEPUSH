export const name = 'timeline'

export const fallback = {
  recentEvents: [],
  total:        0,
  stats:        {},
  available:    false,
}

export async function fetch(filters = {}) {
  try {
    const { getTimeline, summarise } = await import('../../intelligence-timeline/index.js')
    const result = getTimeline(filters)
    const stats  = summarise(filters)
    return {
      recentEvents: Array.isArray(result.events) ? result.events : [],
      total:        typeof result.total === 'number' ? result.total : 0,
      stats:        stats ?? {},
      available:    true,
    }
  } catch {
    return fallback
  }
}
