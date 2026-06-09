#!/usr/bin/env node
/**
 * Autonomous Assistant CLI
 *
 * Usage:
 *   node autonomous-assistant/assistant-cli.js
 *   node autonomous-assistant/assistant-cli.js --briefing
 *   node autonomous-assistant/assistant-cli.js --timeline
 *   node autonomous-assistant/assistant-cli.js --automate
 *   node autonomous-assistant/assistant-cli.js --report
 */

import { observe, MOCK_OBSERVATIONS }              from './observation-engine.js';
import { detectAndRank, summarise }                from './recommendation-engine.js';
import { generateTimeline, getAutomatableEvents }  from './ai-timeline.js';
import { classifyRecommendations, getAutomationReport, generateCoachBriefing } from './decision-support.js';

const args = process.argv.slice(2);
const mode = args[0] ?? '--briefing';

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const RED   = '\x1b[31m';
const YELLOW= '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';
const DIM   = '\x1b[2m';

function sev(urgency) {
  if (urgency === 'CRITICAL') return RED;
  if (urgency === 'HIGH')     return YELLOW;
  if (urgency === 'MEDIUM')   return CYAN;
  return DIM;
}

function bar(val, max = 100, width = 20) {
  const filled = Math.round((val / max) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

async function main() {
  console.log(`\n${BOLD}═══════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Coach's Eye — Autonomous Assistant${RESET}`);
  console.log(`${DIM}  ${new Date().toLocaleString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════${RESET}\n`);

  // Always observe first
  process.stdout.write(`${DIM}Observing club state…${RESET}`);
  const observations = MOCK_OBSERVATIONS;
  console.log(` done (source: ${observations.source}, confidence: ${observations.confidence}%)`);

  const recommendations = detectAndRank(observations);
  const summary         = summarise(recommendations);

  if (mode === '--briefing' || mode === '--all') {
    const timeline = generateTimeline(observations, observations.fixtures?.within7d ?? []);
    const briefing = generateCoachBriefing(recommendations, timeline, observations);

    console.log(`\n${BOLD}MORNING BRIEFING${RESET}`);
    console.log(`${sev(briefing.severity)}${briefing.headline}${RESET}`);
    console.log();
    for (const line of briefing.lines) {
      console.log(`  ${line}`);
    }

    console.log(`\n${BOLD}RECOMMENDATIONS (${summary.total})${RESET}`);
    console.log(`  Critical: ${summary.critical}  High: ${summary.high}  Medium: ${summary.medium}  Low: ${summary.low}`);
    console.log();

    for (const rec of recommendations) {
      const col = sev(rec.urgency);
      console.log(`  ${col}[${rec.urgency.padEnd(8)}]${RESET} ${BOLD}${rec.title}${RESET}`);
      console.log(`  ${DIM}  Confidence: ${rec.confidence}%  Score: ${rec.rankScore}  Time saved: ${rec.timeSaved}min${RESET}`);
      console.log(`  ${DIM}  ${rec.reason.slice(0, 100)}…${RESET}`);
      console.log(`  ${DIM}  Actions: ${rec.actions.filter(a=>!a.system).map(a=>a.label).join(' · ')}${RESET}`);
      console.log();
    }
  }

  if (mode === '--timeline' || mode === '--all') {
    const timeline = generateTimeline(observations, observations.fixtures?.within7d ?? []);
    console.log(`\n${BOLD}AI TIMELINE — Next 14 Days${RESET}`);
    console.log(`  ${timeline.totalEvents} events · ${timeline.automatableCount} automatable\n`);

    for (const day of timeline.byDay.slice(0, 7)) {
      console.log(`  ${BOLD}${day.label}${RESET}`);
      for (const ev of day.events) {
        const col = ev.impact === 'HIGH' ? YELLOW : ev.type === 'FIXTURE' ? GREEN : DIM;
        console.log(`    ${col}${ev.icon ?? '·'} ${ev.title}${RESET}${ev.automatable ? ` ${DIM}[auto]${RESET}` : ''}`);
        console.log(`      ${DIM}${ev.description}${RESET}`);
      }
      console.log();
    }
  }

  if (mode === '--report' || mode === '--automate' || mode === '--all') {
    const classified = classifyRecommendations(recommendations);
    const report     = getAutomationReport(recommendations);

    console.log(`\n${BOLD}AUTOMATION REPORT${RESET}`);
    console.log(`  Total recommendations:  ${report.total}`);
    console.log(`  ${GREEN}Auto-executable:        ${report.autoCount} (${report.autoPercent}%)${RESET}`);
    console.log(`  ${CYAN}Needs your approval:    ${report.approveCount}${RESET}`);
    console.log(`  ${YELLOW}Needs your judgement:   ${report.humanCount}${RESET}`);
    console.log(`  ${GREEN}Time saved today:       ~${report.minutesSaved} minutes${RESET}\n`);

    if (mode === '--automate') {
      console.log(`${BOLD}AUTO-EXECUTING ${report.autoCount} ACTIONS${RESET}`);
      for (const a of report.breakdown.auto) {
        console.log(`  ${GREEN}✓${RESET} ${a.type}: ${a.title} ${DIM}(+${a.timeSaved}min)${RESET}`);
      }
    }
  }

  console.log(`\n${DIM}Run with --briefing | --timeline | --report | --automate | --all${RESET}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
