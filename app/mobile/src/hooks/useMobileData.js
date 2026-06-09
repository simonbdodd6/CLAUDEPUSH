import { useState, useEffect, useCallback } from 'react';
import { api, twin, fixtures, MOCK } from '../api/client.js';

const CACHE = new Map();
const STALE_MS = 60_000;

function cached(key, fn) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.ts < STALE_MS) return Promise.resolve(hit.data);
  return fn().then(data => { CACHE.set(key, { data, ts: now }); return data; });
}

export function useMobileData() {
  const [state, setState] = useState({
    health:          null,
    briefing:        null,
    upcomingFixtures:[],
    alerts:          MOCK.alerts,
    recommendations: MOCK.recommendations,
    twinStatus:      null,
    loading:         true,
    error:           null,
    lastRefreshed:   null,
  });

  const load = useCallback(async (force = false) => {
    if (force) CACHE.clear();
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [health, brief, upcoming, status, recs] = await Promise.all([
        cached('health',    () => twin.health()),
        cached('briefing',  () => api.briefing('coach')),
        cached('fixtures',  () => fixtures.upcoming(5)),
        cached('status',    () => twin.status()),
        cached('recs',      () => api.recommendations()),
      ]);
      setState(s => ({
        ...s,
        health:           health ?? MOCK.clubHealth,
        briefing:         brief  ?? MOCK.briefing,
        upcomingFixtures: Array.isArray(upcoming) ? upcoming : [],
        twinStatus:       status ?? MOCK.twinStatus,
        recommendations:  Array.isArray(recs) ? recs : MOCK.recommendations,
        loading:          false,
        lastRefreshed:    Date.now(),
      }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: () => load(true) };
}

export function useFixture(id) {
  const [fixture, setFixture]   = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [pack, setPack]         = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([fixtures.get(id), fixtures.timeline(id)])
      .then(([f, t]) => { setFixture(f); setTimeline(t); setLoading(false); });
  }, [id]);

  const loadPack = useCallback(async () => {
    const p = await fixtures.pack(id);
    setPack(p);
    return p;
  }, [id]);

  return { fixture, timeline, pack, loading, loadPack };
}

export function useAlerts() {
  const [alerts, setAlerts]   = useState(MOCK.alerts);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.injuries(), twin.risks()])
      .then(([injuries, risks]) => {
        const all = [];
        if (injuries?.data?.length)
          all.push(...injuries.data.map(i => ({ id: `inj-${i.playerId ?? i.id}`, type: 'INJURY', severity: 'HIGH', title: `${i.playerName ?? 'Player'} — ${i.status}`, description: i.notes ?? '', ts: i.ts ?? new Date().toISOString() })));
        if (risks?.length)
          all.push(...risks.map(r => ({ id: `risk-${r.id ?? r.type}`, type: r.type, severity: r.severity, title: r.title, description: r.description ?? '', ts: new Date().toISOString() })));
        setAlerts(all.length ? all : MOCK.alerts);
        setLoading(false);
      });
  }, []);

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
  return { alerts, loading, criticalCount };
}
