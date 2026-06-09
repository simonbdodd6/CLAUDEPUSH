// Live Activity Feed — aggregates events from all engines in chronological order.
import { getRecentHistory as getCommsHistory } from '../../communications-engine/communication-history.js';
import { getRecentHistory as getWorkflowHistory } from '../../workflow-engine/workflow-history.js';
import { getAll as getAllApprovals } from '../approval-centre/approval-queue.js';

const FEED_ICONS = {
  'comm.sent':             '📨',
  'comm.scheduled':        '📅',
  'comm.failed':           '❌',
  'workflow.completed':    '✅',
  'workflow.failed':       '❌',
  'workflow.started':      '⚙️',
  'step.completed':        '✓',
  'approval.pending':      '⏳',
  'approval.approved':     '✅',
  'approval.rejected':     '❌',
  'approval.archived':     '📦',
  'data.health':           '📊',
};

function eventToFeedItem(event, source) {
  const icon = FEED_ICONS[event.event] ?? '•';
  const ts   = event.ts ?? event.createdAt ?? new Date().toISOString();

  let text = '';
  if (source === 'comms') {
    text = `${event.type?.replace(/_/g, ' ') ?? 'Communication'} ${event.event?.replace('comm.', '') ?? ''}${event.channel ? ` via ${event.channel}` : ''}${event.recipientId ? ` → ${event.recipientId}` : ''}`;
  } else if (source === 'workflow') {
    text = `Workflow ${event.event?.replace('workflow.', '') ?? event.event}: ${event.workflowId ?? event.runId ?? '—'}`;
  } else if (source === 'approval') {
    text = `${event.title ?? event.type ?? 'Item'} → ${event.status ?? 'pending'}${event.approvedBy ? ` by ${event.approvedBy}` : ''}`;
  }

  return { icon, text, ts, source, raw: event };
}

export function buildActivityFeed(n = 30) {
  const items = [];

  // Communications history
  try {
    getCommsHistory(50).slice(0, 20).forEach(e => items.push(eventToFeedItem(e, 'comms')));
  } catch { /* non-fatal */ }

  // Workflow history
  try {
    getWorkflowHistory(50).slice(0, 20).forEach(e => items.push(eventToFeedItem(e, 'workflow')));
  } catch { /* non-fatal */ }

  // Approval queue events
  try {
    getAllApprovals().slice(-20).forEach(a => items.push(eventToFeedItem({ ...a, event: `approval.${a.status}` }, 'approval')));
  } catch { /* non-fatal */ }

  // Sort newest first
  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return {
    items: items.slice(0, n),
    total: items.length,
    sources: { comms: items.filter(i => i.source === 'comms').length, workflow: items.filter(i => i.source === 'workflow').length, approval: items.filter(i => i.source === 'approval').length },
  };
}

// Register a custom activity event from any engine.
const _customEvents = [];
export function logActivity(text, source = 'system', icon = '•') {
  _customEvents.push({ icon, text, ts: new Date().toISOString(), source });
}

export function formatActivityFeed(feed, limit = 15) {
  const items = feed.items.slice(0, limit);
  if (items.length === 0) return '## Live Activity Feed\n\n_No activity yet_\n';

  const rows = items.map(item => {
    const time = new Date(item.ts).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    return `- \`${time}\` ${item.icon} ${item.text}`;
  });

  return `## Live Activity Feed (${feed.total} events)

${rows.join('\n')}

_Sources: ${feed.sources.comms} comms · ${feed.sources.workflow} workflow · ${feed.sources.approval} approvals_`;
}
