/**
 * Action Engine
 * Executes quick actions triggered after a Copilot response.
 * Actions: save_session, create_pdf, assign_programme, update_memory, send_to_player, pin_insight
 */

// Lazy imports to avoid circular deps
let _mem = null;
async function mem() {
  if (!_mem) {
    try { _mem = await import('../memory-engine/index.js'); }
    catch { _mem = null; }
  }
  return _mem;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleSaveSession(payload, context) {
  const m = await mem();
  if (!m) return { success: false, message: 'Memory Engine not available' };

  const sessionData = payload.content ?? payload.session ?? payload;
  try {
    const sessionId = await m.rememberSession({
      focus:     sessionData.focus ?? context.intent,
      ageGroup:  sessionData.ageGroup ?? context.entities?.ageGroup,
      teamId:    context.team?.id,
      notes:     `Saved from AI Copilot — ${new Date().toISOString()}`,
      raw:       sessionData,
    });
    return { success: true, message: `Session saved (id: ${sessionId ?? 'n/a'})`, sessionId };
  } catch (err) {
    return { success: false, message: `Save failed: ${err.message}` };
  }
}

async function handleAssignProgramme(payload, context) {
  const m = await mem();
  if (!m) return { success: false, message: 'Memory Engine not available' };

  const programme = payload.content ?? payload.programme ?? payload;
  const player    = context.player ?? payload.player;

  if (!player?.id) return { success: false, message: 'No player resolved — specify a player to assign to' };

  try {
    const progId = await m.rememberProgramme({
      playerId: player.id,
      status:   'active',
      input:    programme.raw?.input ?? programme,
      raw:      programme,
    });
    return { success: true, message: `Programme assigned to ${player.core?.name ?? 'player'} (id: ${progId ?? 'n/a'})`, progId };
  } catch (err) {
    return { success: false, message: `Assign failed: ${err.message}` };
  }
}

async function handleUpdateMemory(payload, context) {
  const m = await mem();
  if (!m) return { success: false, message: 'Memory Engine not available' };

  try {
    if (context.player) {
      await m.rememberPlayer({ ...context.player.core, ...payload.updates });
    }
    return { success: true, message: 'Memory updated' };
  } catch (err) {
    return { success: false, message: `Memory update failed: ${err.message}` };
  }
}

async function handleSendToPlayer(payload, context) {
  // Stub — real implementation hooks into the notification system in api/
  const player = context.player ?? payload.player;
  const name   = player?.core?.name ?? 'the player';

  return {
    success: true,
    message: `Push notification queued for ${name}`,
    note:    'Connect to api/notifications.js to deliver',
  };
}

async function handleCreatePdf(payload, context) {
  // Stub — pdf generation will use a future PDF engine
  return {
    success: true,
    message: 'PDF generation queued',
    note:    'Connect to qa/coaching-engine pdf-outline module to render',
    filename: `copilot-export-${Date.now()}.pdf`,
  };
}

async function handlePinInsight(payload, context) {
  // The chat-manager records pinned insights in conversation memory
  return {
    success: true,
    message: 'Insight pinned',
    insight: payload.text ?? payload.summary ?? 'Insight saved',
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const HANDLERS = {
  save_session:     handleSaveSession,
  assign_programme: handleAssignProgramme,
  update_memory:    handleUpdateMemory,
  send_to_player:   handleSendToPlayer,
  create_pdf:       handleCreatePdf,
  pin_insight:      handlePinInsight,
  share_with_coach: async () => ({ success: true, message: 'Share link generated (stub)' }),
};

export async function executeAction(actionId, payload = {}, context = {}) {
  const handler = HANDLERS[actionId];
  if (!handler) {
    return { success: false, message: `Unknown action: ${actionId}`, actionId };
  }

  const start = Date.now();
  try {
    const result = await handler(payload, context);
    return {
      actionId,
      duration: Date.now() - start,
      ...result,
    };
  } catch (err) {
    return {
      actionId,
      success:  false,
      message:  err.message,
      duration: Date.now() - start,
    };
  }
}

export function listAvailableActions() {
  return Object.keys(HANDLERS);
}
