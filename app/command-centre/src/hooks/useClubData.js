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
export function usePlatformStatus()  { return useData(() => api.platformStatus(), 'platformStatus') }

// Approvals queue + coach actions. approve/reject hit the server then reload the
// queue so the UI reflects the new state. Errors surface via the returned promise.
export function useApprovals() {
  const state = useData(() => api.approvals(), 'approvals')
  const approve = useCallback(async (id) => {
    const res = await api.approveApproval(id)
    await state.reload()
    return res
  }, [state.reload])
  const reject = useCallback(async (id, reason = '') => {
    const res = await api.rejectApproval(id, reason)
    await state.reload()
    return res
  }, [state.reload])
  return { ...state, approve, reject }
}
