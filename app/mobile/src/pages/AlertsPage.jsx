import { useState } from 'react';
import AlertItem from '../components/ui/AlertItem.jsx';
import Spinner   from '../components/ui/Spinner.jsx';

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export default function AlertsPage({ alerts = [], loading = false }) {
  const [filter, setFilter] = useState('ALL');

  const sorted = [...alerts].sort((a, b) =>
    (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
  );

  const filtered = filter === 'ALL' ? sorted : sorted.filter(a => a.severity === filter);

  const counts = {
    ALL:      alerts.length,
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH:     alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM:   alerts.filter(a => a.severity === 'MEDIUM').length,
  };


  return (
    <div className="pt-2 pb-4">
      <div className="mb-4">
        <h1 className="text-xl font-black text-ink-1">Alerts</h1>
        <p className="text-xs text-ink-3">{counts.ALL} active</p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
              filter === f
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-ink-3 border border-border-subtle'
            }`}
          >
            {f} {counts[f] > 0 && <span className="ml-0.5 opacity-70">{counts[f]}</span>}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-ink-2 font-semibold">No {filter !== 'ALL' ? filter.toLowerCase() : ''} alerts</p>
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-2">
          {filtered.map(alert => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}
