import { useState, useEffect, useCallback } from 'react'
import { api, safeFetch, MOCK } from '../api/client.js'

function useData(fetcher, mockKey, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (e) {
      setError(e.message)
      if (mockKey) setData(MOCK[mockKey])
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}

export function useClubHealth()      { return useData(() => api.clubHealth(),     'clubHealth') }
export function useInjuries()        { return useData(() => api.injuries(),       'injuries') }
export function useAttendance()      { return useData(() => api.attendance(),     'attendance') }
export function useRecommendations() { return useData(() => api.recommendations(),'recommendations') }
export function useHistory()         { return useData(() => api.history(),        'history') }
export function useApprovals()       { return useData(() => api.approvals(),      'approvals') }
export function usePlatformStatus()  { return useData(() => api.platformStatus(), 'platformStatus') }
export function useBriefing()        { return useData(() => api.briefing(),        'briefing') }
export function useSeasonPhase()     { return useData(() => api.seasonPhase(),     'seasonPhase') }
export function useTimeline()        { return useData(() => api.timeline(),        'timeline') }
export function useLearningStatus()  { return useData(() => api.learningStatus(),  'learningStatus') }
