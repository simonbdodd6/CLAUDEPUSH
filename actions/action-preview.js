// Coach's Eye Action Library — Preview mode (dry-run: describes without executing)

export async function previewAction(action, params = {}, context = {}) {
  if (!action) return { error: 'Action not found' };

  const startMs = Date.now();
  let detail    = null;

  if (typeof action.preview === 'function') {
    try   { detail = await action.preview(params, context); }
    catch (err) { detail = { previewError: err.message }; }
  }

  return {
    actionId:           action.id,
    name:               action.name,
    category:           action.category,
    description:        action.description,
    requiredEngines:    action.requiredEngines,
    requiredPermissions: action.requiredPermissions,
    estimatedRuntimeMs: action.estimatedRuntimeMs,
    sendsComms:         action.sendsComms ?? false,
    requiresApproval:   action.requiresApproval ?? false,
    params,
    willDo:             buildWillDo(action, params),
    willCallEngines:    action.requiredEngines,
    detail,
    isPreview:          true,
    previewMs:          Date.now() - startMs,
  };
}

function buildWillDo(action, params) {
  const lines = [
    `Execute **${action.name}** (${action.category})`,
    `Orchestrate: ${action.requiredEngines.join(' → ')}`,
    `Estimated runtime: ~${action.estimatedRuntimeMs}ms`,
  ];
  if (action.sendsComms)         lines.push('⚠️  Will draft communications — requires human approval before send');
  if (action.requiresApproval)   lines.push('⚠️  Will create approval items for committee review');
  if (params.ageGroup)           lines.push(`Age group: ${params.ageGroup}`);
  if (params.playerId)           lines.push(`Player: ${params.playerId}`);
  if (params.teamId)             lines.push(`Team: ${params.teamId}`);
  if (params.date)               lines.push(`Date: ${params.date}`);
  return lines;
}

export function formatPreview(p) {
  const lines = [
    `## Preview: ${p.name}`,
    `> ${p.description}`,
    '',
    `**Category:** ${p.category}  |  **Est. runtime:** ${p.estimatedRuntimeMs}ms`,
    `**Engines:** ${p.willCallEngines.join(', ')}`,
    `**Permissions:** ${p.requiredPermissions.join(' | ')}`,
    '',
    '**This action will:**',
    ...p.willDo.map(l => `- ${l}`),
  ];

  if (p.detail && !p.detail?.previewError) {
    lines.push('', '**Detail:**');
    Object.entries(p.detail).forEach(([k, v]) => lines.push(`- ${k}: ${JSON.stringify(v).slice(0, 100)}`));
  }

  return lines.join('\n');
}
