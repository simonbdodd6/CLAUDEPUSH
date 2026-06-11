export const name = 'clubIntelligence'

export const fallback = {
  health:    null,
  insights:  [],
  available: false,
}

export async function fetch() {
  try {
    const { getClubHealth, getTopInsights } = await import('../../qa/club-intelligence/index.js')
    const [health, insights] = await Promise.all([
      Promise.resolve().then(() => getClubHealth()).catch(() => null),
      Promise.resolve().then(() => getTopInsights()).catch(() => []),
    ])
    return {
      health:    health    ?? null,
      insights:  Array.isArray(insights) ? insights : [],
      available: true,
    }
  } catch {
    return fallback
  }
}
