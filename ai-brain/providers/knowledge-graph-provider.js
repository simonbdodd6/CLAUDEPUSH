export const name = 'knowledgeGraph'

export const fallback = {
  stats:     { nodeCount: 0, edgeCount: 0, byType: {}, byEdgeType: {}, avgDegree: '0.00' },
  available: false,
}

export async function fetch() {
  try {
    const { graphStats } = await import('../../knowledge-graph/graph-query.js')
    const stats = graphStats()
    return { stats, available: true }
  } catch {
    return fallback
  }
}
