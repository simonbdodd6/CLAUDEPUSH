#!/usr/bin/env node
// Coach's Eye Weekly Communications Pack — generator CLI
// Usage: node communications-engine/communications-pack-cli.js

import { buildWeeklyPack, formatWeeklyPack } from './communications-pack-builder.js';
import { getHistoryStats } from './communication-history.js';
import { scheduleStats } from './schedule-manager.js';
import { listChannels } from './delivery-planner.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACK_PATH   = join(__dirname, '../WEEKLY_CLUB_COMMUNICATIONS_PACK.md');
const REPORT_PATH = join(__dirname, '../COMMUNICATIONS_PACK_REPORT.md');

const LINE = '─'.repeat(60);
function section(title) { console.log(`\n${LINE}\n  ${title}\n${LINE}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function info(msg) { console.log(`  · ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function flag(msg) { console.log(`  🚩 ${msg}`); }

async function main() {
  console.log('\n📡  Coach\'s Eye — Weekly Communications Pack Generator\n');
  console.log('  ⚠️  ALL OUTPUTS ARE DRAFTS — nothing will be sent without human approval.\n');

  // ── Build the pack ───────────────────────────────────────────────────────────
  section('Generating Weekly Pack');

  const pack = await buildWeeklyPack({
    clubName:    'Kildare Valley RFC',
    coachName:   'Brian O\'Sullivan',
    contactName: 'Séan McCarthy',
    season:      '2025-26',
  });

  ok(`Pack ID: ${pack.packId}`);
  ok(`Week of: ${pack.weekOf}`);
  ok(`${pack.stats.totalDrafts} communication drafts generated`);
  ok(`${pack.stats.totalSocialPosts} social media post drafts`);
  info(`Risk breakdown: ${Object.entries(pack.stats.byRisk).map(([r,n]) => `${n} ${r}`).join(', ')}`);
  info(`Mock data: ${pack.isMock ? 'Yes — replace with real data before sending' : 'No'}`);

  if (pack.warnings.length > 0) {
    section('Warnings');
    pack.warnings.forEach(w => warn(w));
  }

  // ── Draft summary ────────────────────────────────────────────────────────────
  section('Draft Communications');
  pack.drafts.forEach((d, i) => {
    const riskIcon = d.riskLevel === 'high' ? '🔴' : d.riskLevel === 'medium' ? '🟡' : '🟢';
    ok(`${i + 1}. ${d.type.replace(/_/g, ' ').padEnd(30)} → ${d.audienceSummary}`);
    info(`   ${riskIcon} ${d.riskLevel} risk | channel: ${d.channel} | checklist: ${d.sendChecklist.length} items`);
  });

  // ── Social media drafts ───────────────────────────────────────────────────────
  section('Social Media Drafts');
  pack.socialDrafts.forEach((s, i) => {
    ok(`${i + 1}. ${s.type?.replace(/_/g, ' ')}: Facebook, Instagram, X (Twitter)`);
    if (s.posts?.facebook?.suggestedImageNote) info(`   Image: ${s.posts.facebook.suggestedImageNote}`);
  });

  // ── Approval requirements ────────────────────────────────────────────────────
  section('Approval Requirements');
  const highRisk = pack.drafts.filter(d => d.riskLevel === 'high');
  const midRisk  = pack.drafts.filter(d => d.riskLevel === 'medium');
  const lowRisk  = pack.drafts.filter(d => d.riskLevel === 'low');

  if (highRisk.length > 0) {
    flag(`${highRisk.length} high-risk item(s) — committee approval required:`);
    highRisk.forEach(d => flag(`  • ${d.type.replace(/_/g, ' ')} → ${d.audienceSummary}`));
  }
  if (midRisk.length > 0) {
    warn(`${midRisk.length} medium-risk item(s) — coach/manager review recommended`);
    midRisk.forEach(d => info(`  • ${d.type.replace(/_/g, ' ')} → ${d.audienceSummary}`));
  }
  ok(`${lowRisk.length} low-risk item(s) — standard review`);

  // ── Channels ──────────────────────────────────────────────────────────────────
  section('Channel Status');
  const channels = listChannels();
  channels.forEach(c => {
    const icon = c.status === 'live' ? '✓' : c.status === 'stub' ? '~' : '·';
    console.log(`  ${icon} ${c.status.padEnd(8)} ${c.name.padEnd(14)} — ${c.description}`);
  });

  // ── History & schedule stats ──────────────────────────────────────────────────
  section('History & Schedule');
  const hist  = getHistoryStats();
  const sched = scheduleStats();
  info(`Communication history: ${hist.total} events, ${hist.sent} sent`);
  info(`Schedule queue: ${sched.pending} pending, ${sched.recurring} recurring`);

  // ── Write files ───────────────────────────────────────────────────────────────
  section('Writing Output Files');

  // 1. Weekly pack (human-readable)
  const packMarkdown = formatWeeklyPack(pack);
  writeFileSync(PACK_PATH, packMarkdown, 'utf8');
  ok(`WEEKLY_CLUB_COMMUNICATIONS_PACK.md written`);

  // 2. Report
  const report = buildPackReport(pack, channels, hist, sched);
  writeFileSync(REPORT_PATH, report, 'utf8');
  ok(`COMMUNICATIONS_PACK_REPORT.md written`);

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log(`\n${LINE}`);
  console.log(`  Weekly pack complete — ${pack.stats.totalDrafts} drafts, ${pack.stats.totalSocialPosts} social posts`);
  console.log(`  ⚠️  ALL ITEMS ARE DRAFTS — review before sending`);
  console.log(`${LINE}\n`);
}

function buildPackReport(pack, channels, hist, sched) {
  const now = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const liveChannels   = channels.filter(c => c.status === 'live').length;
  const stubChannels   = channels.filter(c => c.status === 'stub').length;
  const futureChannels = channels.filter(c => c.status === 'future').length;

  const draftTable = pack.drafts.map(d => {
    const risk = d.riskLevel === 'high' ? '🔴 High' : d.riskLevel === 'medium' ? '🟡 Medium' : '🟢 Low';
    return `| **${d.type.replace(/_/g, ' ')}** | ${d.audienceSummary} | ${d.channel} | ${risk} | ${d.status} |`;
  }).join('\n');

  const socialTable = pack.socialDrafts.map(s =>
    `| ${(s.type ?? 'post').replace(/_/g, ' ')} | Facebook, Instagram, X | draft |`
  ).join('\n');

  return `# Communications Pack Report — ${now}

*Pack ID: \`${pack.packId}\` | Week of ${pack.weekOf}*

---

## Phase 2: What Was Built

This report covers the Phase 2 additions to the Coach's Eye Communications Engine:

### New Modules

| Module | Role |
|--------|------|
| \`communications-pack-builder.js\` | Assembles the full weekly pack from all builder modules + data sources |
| \`draft-manager.js\` | Human approval safety layer — every communication starts as a draft |
| \`social-media-builder.js\` | Facebook, Instagram, X (Twitter) post drafts |
| \`committee-summary-builder.js\` | Weekly committee digest with results, attendance, membership, alerts |

### Integrations Added

| Integration | What Changed |
|-------------|-------------|
| **AI Copilot** | \`communications-engine-adapter.js\` — handles 17 NL intents |
| **Workflow Engine** | 3 new actions: \`generate_communication\`, \`build_communications_pack\`, \`schedule_communication\` |
| **Workflow Parser** | New \`communications_pack\` template — 5-step automated workflow |
| **Communications Engine** | New exports: \`buildWeeklyPack\`, \`createDraft\`, \`buildMatchResultPost\`, \`buildCommitteeSummary\` |

---

## Weekly Pack Contents

### Communication Drafts (${pack.stats.totalDrafts})

| Type | Audience | Channel | Risk | Status |
|------|----------|---------|------|--------|
${draftTable}

### Social Media Drafts (${pack.stats.totalSocialPosts})

| Type | Platforms | Status |
|------|-----------|--------|
${socialTable}

---

## Human Approval Safety

Every communication generated by this engine has:

| Property | Value |
|----------|-------|
| \`status\` | \`draft\` |
| \`requiresHumanApproval\` | \`true\` |
| \`approvedBy\` | \`null\` (until approved) |
| Risk assessment | Automatic (low/medium/high) |
| Risk notes | ✅ Generated per communication |
| Send checklist | ✅ Generated per communication |

**Nothing is sent until a human explicitly approves and triggers delivery.**

---

## Risk Breakdown

| Level | Count | Triggers |
|-------|-------|---------|
| 🔴 High | ${pack.stats.byRisk.high ?? 0} | External stakeholders, mass sends, financial content |
| 🟡 Medium | ${pack.stats.byRisk.medium ?? 0} | Squad-wide sends, volunteer requests, renewals |
| 🟢 Low | ${pack.stats.byRisk.low ?? 0} | Training reminders, internal coach messages |

---

## Channel Status

| Channel | Status | Description |
|---------|--------|-------------|
${channels.map(c => `| **${c.name}** | ${c.status} | ${c.description} |`).join('\n')}

**${liveChannels} live, ${stubChannels} stub (connect to activate), ${futureChannels} future**

---

## Workflow Engine Integration

The new \`communications_pack\` workflow template can be triggered with:

\`\`\`
"Generate this week's club communications pack"
"Build weekly club newsletter"
"Prepare weekend communications"
"Create sponsor thank-you"
\`\`\`

Steps executed:
1. \`build_communications_pack\` — generates all drafts from club data
2. \`generate_communication\` — previews newsletter draft
3. \`update_player_memory\` — logs pack to Memory Engine
4. \`schedule_communication\` — (optional) schedules approved items
5. \`send_coach_notification\` — notifies coach pack is ready for review

---

## AI Copilot Integration

The copilot adapter handles these natural language requests:

| Intent | Example phrases |
|--------|----------------|
| communications_pack | "Generate this week's club pack", "Prepare weekend communications" |
| newsletter | "Build club newsletter", "Weekly update" |
| volunteer_request | "Ask for BBQ volunteers", "Need stewards for Saturday" |
| sponsor_update | "Send sponsor thank-you", "Sponsor update" |
| oldboys | "Send old boys an update", "Alumni invitation" |
| match_report | "Write a match report", "Game report" |
| social_media | "Create social media post", "Facebook result post" |
| awards_evening | "Awards evening invite" |
| christmas_function | "Christmas dinner invite" |
| season_launch | "New season announcement" |

---

## History & Schedule Stats

| Metric | Value |
|--------|-------|
| Total history events | ${hist.total} |
| Sent | ${hist.sent} |
| Scheduled queue | ${sched.pending} pending, ${sched.recurring} recurring |

---

## Warnings

${pack.warnings.length > 0 ? pack.warnings.map(w => `- ⚠️ ${w}`).join('\n') : '- No warnings'}

---

## Files Generated by This Run

| File | Description |
|------|-------------|
| \`WEEKLY_CLUB_COMMUNICATIONS_PACK.md\` | Human-readable pack with all drafts, risk notes, send checklists |
| \`COMMUNICATIONS_PACK_REPORT.md\` | Architecture report and integration documentation |

---

## Next Steps to Go Live

1. **Connect real recipient data** — replace mock data in Data Integration Layer adapters
2. **Activate email adapter** — connect SendGrid or Mailchimp in \`delivery-planner.js\`
3. **Activate SMS adapter** — connect Twilio for urgent alerts
4. **Connect social media** — Facebook Graph API, Instagram Business API
5. **Set up approval workflow** — build a simple UI or Slack bot for human approval
6. **Schedule recurring pack** — run \`scheduleRecurring(pack, { frequency: 'weekly', dayOfWeek: 1 })\`

---

*Generated by Coach's Eye Communications Engine Phase 2*
`;
}

main().catch(err => {
  console.error('\n✗ Communications Pack CLI failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
