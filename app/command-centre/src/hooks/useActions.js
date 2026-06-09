import { useState, useEffect, useMemo } from 'react'
import { api, MOCK } from '../api/client.js'

export function useActions() {
  const [actions, setActions]   = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.actions()
      .then(list => setActions(Array.isArray(list) ? list : []))
      .catch(() => setActions([]))
      .finally(() => setLoading(false))
  }, [])

  return { actions, loading }
}

export function useActionRunner() {
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  async function run(actionId, params = {}, context = {}) {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.runAction(actionId, params, context)
      setResult(res)
      return res
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setRunning(false)
    }
  }

  function reset() { setResult(null); setError(null) }

  return { run, running, result, error, reset }
}

export function useActionSearch(actions, query) {
  return useMemo(() => {
    if (!query?.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.tags?.some(t => t.includes(q)) ||
      a.category?.toLowerCase().includes(q)
    )
  }, [actions, query])
}

export function useActionsByCategory(actions) {
  return useMemo(() => {
    const map = {}
    for (const a of actions) {
      if (!map[a.category]) map[a.category] = []
      map[a.category].push(a)
    }
    return map
  }, [actions])
}
