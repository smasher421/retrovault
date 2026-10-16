import { useCallback, useEffect, useRef, useState } from 'react'

export async function gogRequest(path = '', options) {
  const response = await fetch(`/api/accounts/gog${path}`, options)
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The GOG API is unavailable. Restart the RetroVault server after updating it.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'GOG request failed.')
  return data
}

export default function useGogAccount(userId, onSynced) {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const completedJob = useRef(null)
  const refresh = useCallback(async () => {
    try {
      const next = await gogRequest()
      if (next.job && next.job.status !== 'running' && completedJob.current !== next.job.started_at) {
        await onSynced()
        completedJob.current = next.job.started_at
      }
      setAccount(next); setError('')
      return next
    } catch (failure) { setError(failure.message); return null }
  }, [onSynced])
  useEffect(() => {
    if (!userId) return
    let active = true
    const update = async () => {
      try {
        const next = await gogRequest()
        if (active) { setAccount(next); setError(''); completedJob.current = next.job?.status === 'running' ? null : next.job?.started_at }
      } catch (failure) { if (active) setError(failure.message) }
    }
    void update()
    return () => { active = false }
  }, [userId])
  useEffect(() => {
    if (!userId || account?.job?.status !== 'running') return
    const timer = setInterval(refresh, 2500)
    return () => clearInterval(timer)
  }, [userId, account?.job?.status, refresh])
  return { account, error, refresh }
}
