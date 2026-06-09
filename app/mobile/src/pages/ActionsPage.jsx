import { useState } from 'react';
import QuickButton from '../components/ui/QuickButton.jsx';
import Spinner     from '../components/ui/Spinner.jsx';
import { api }     from '../api/client.js';

const QUICK_ACTIONS = [
  { icon: '📋', label: 'Take Attendance',       actionId: 'RECORD_ATTENDANCE',      accent: true  },
  { icon: '⚽', label: 'Prep Match Pack',        actionId: 'GENERATE_MATCH_PACK',    accent: true  },
  { icon: '📩', label: 'Send Newsletter',        actionId: 'SEND_NEWSLETTER'                       },
  { icon: '🙋', label: 'Confirm Volunteers',     actionId: 'CONFIRM_VOLUNTEERS'                    },
  { icon: '🩹', label: 'Log Injury',             actionId: 'LOG_INJURY'                            },
  { icon: '👤', label: 'Register Player',        actionId: 'REGISTER_PLAYER'                       },
  { icon: '📊', label: 'Club Health Report',     actionId: 'GENERATE_HEALTH_REPORT'                },
  { icon: '💬', label: 'Message Team',           actionId: 'SEND_TEAM_MESSAGE'                     },
  { icon: '📅', label: 'Schedule Session',       actionId: 'SCHEDULE_SESSION'                      },
  { icon: '✅', label: 'Review Approvals',       actionId: 'REVIEW_APPROVALS'                      },
  { icon: '📈', label: 'Attendance Trends',      actionId: 'ATTENDANCE_TRENDS'                     },
  { icon: '🔄', label: 'Refresh Digital Twin',   actionId: 'RUN_DIGITAL_TWIN'                      },
];

export default function ActionsPage() {
  const [running, setRunning] = useState(null);
  const [result,  setResult]  = useState(null);

  async function runAction(action) {
    setRunning(action.actionId);
    setResult(null);
    try {
      const res = await api.runAction(action.actionId, {}, { role: 'admin', source: 'mobile' });
      const msg = res?.result?.message ?? res?.message ?? `${action.label} complete`;
      setResult({ label: action.label, msg, ok: true });
    } catch (e) {
      setResult({ label: action.label, msg: e.message, ok: false });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="pt-2 pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-black text-ink-1">Quick Actions</h1>
        <p className="text-xs text-ink-3">12 one-tap operations</p>
      </div>

      {/* Result toast */}
      {result && (
        <div
          className={`mb-4 p-3 rounded-2xl text-sm flex items-start gap-2 ${result.ok ? '' : ''}`}
          style={{
            background: result.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
          onClick={() => setResult(null)}
        >
          <span>{result.ok ? '✅' : '❌'}</span>
          <div>
            <p className={`font-semibold text-xs ${result.ok ? 'text-success' : 'text-danger'}`}>{result.label}</p>
            <p className="text-ink-2 text-xs mt-0.5">{result.msg}</p>
          </div>
        </div>
      )}

      {/* 3-column grid of 12 buttons */}
      <div className="grid grid-cols-3 gap-3">
        {QUICK_ACTIONS.map(action => (
          <div key={action.actionId} className="relative">
            {running === action.actionId && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl z-10"
                   style={{ background: 'rgba(9,9,14,0.7)' }}>
                <Spinner size={18} />
              </div>
            )}
            <QuickButton
              icon={action.icon}
              label={action.label}
              accent={action.accent}
              onClick={() => runAction(action)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
