import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLeads, loadCompetitors } from './lead-db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const REPORTS_DIR = join(ROOT, 'qa/market-reports');

// Pricing model: €70/month = €840/year per club
const PRICE_ANNUAL = 840;

// Estimated conversion probability by fit score tier
const CONVERSION = [[9, 0.30], [8, 0.20], [7, 0.10], [6, 0.05], [0, 0.01]];

// Rough total rugby club estimates by country (public federation data approx)
const MARKET_SIZE = {
  England: 2000, France: 1700, Ireland: 230, 'South Africa': 400,
  'New Zealand': 350, Australia: 280, Wales: 220, Scotland: 210,
  Argentina: 300, Italy: 350, Japan: 400, Canada: 150, USA: 400,
};

function convRate(score) {
  for (const [threshold, rate] of CONVERSION) {
    if ((score ?? 0) >= threshold) return rate;
  }
  return 0.01;
}

function expectedARR(lead) {
  return Math.round(convRate(lead.fitScore) * PRICE_ANNUAL);
}

function badge(score) {
  if (score >= 8) return '🟢 Strong fit';
  if (score >= 6) return '🟡 Possible fit';
  return '🔴 Low fit';
}

function bar(score, width = 10) {
  const filled = Math.round((score / 10) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function ensure(dir) { mkdirSync(dir, { recursive: true }); }

function write(path, content) {
  ensure(dirname(path));
  writeFileSync(path, content, 'utf8');
}

export function writeHotLeadsReport(leads) {
  const hot = leads
    .filter(l => (l.fitScore ?? 0) >= 7.5 && l.status !== 'converted' && l.status !== 'not_fit')
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));

  const pipelineARR = hot.reduce((s, l) => s + expectedARR(l), 0);
  const withEmail = hot.filter(l => l.email).length;
  const avgScore = hot.length ? (hot.reduce((s, l) => s + (l.fitScore ?? 0), 0) / hot.length).toFixed(1) : '—';

  const tableRows = hot.map((l, i) =>
    `| ${i + 1} | **${l.clubName}** | ${l.country} | ${l.level} | ${badge(l.fitScore ?? 0)} \`${l.fitScore ?? '—'}\` | ${l.email ? `\`${l.email}\`` : '—'} | €${expectedARR(l)}/yr |`
  ).join('\n');

  const details = hot.map(l => `
### ${l.clubName} — ${l.country} \`${l.fitScore}/10\`
${badge(l.fitScore ?? 0)} | Level: ${l.level} | Status: \`${l.status}\`

**Fit score:** ${bar(l.fitScore ?? 0)} ${l.fitScore}/10
**Expected ARR:** €${expectedARR(l)}/yr (${Math.round(convRate(l.fitScore) * 100)}% conversion est.)

**Contact:**${l.email ? `\n- Email: \`${l.email}\`` : ''}${l.socialFacebook ? `\n- Facebook: ${l.socialFacebook}` : ''}${l.socialInstagram ? `\n- Instagram: ${l.socialInstagram}` : ''}${l.website ? `\n- Website: ${l.website}` : ''}${!l.email && !l.socialFacebook && !l.socialInstagram && !l.website ? '\n- No contact info found' : ''}

**Notes:** ${l.notes || '_(none)_'}

_Source: ${l.source} | Last reviewed: ${l.lastReviewed ? l.lastReviewed.slice(0, 10) : '—'}_
`).join('\n---\n');

  write(join(REPORTS_DIR, 'HOT_LEADS_REPORT.md'), `# Hot Leads Report

_Generated: ${new Date().toISOString()}_
_Threshold: fit score ≥ 7.5 | Excludes converted and not-fit leads_

---

## Summary

| Metric | Value |
|--------|-------|
| Hot leads | **${hot.length}** |
| Expected pipeline ARR | **€${pipelineARR.toLocaleString()}** |
| Avg fit score | ${avgScore} |
| With email contact | ${withEmail} of ${hot.length} |

> Conversion assumptions: 30% at score ≥9, 20% at ≥8, 10% at ≥7, at €${PRICE_ANNUAL}/yr per club.

---

## Hot Leads — Ranked by Fit Score

| Rank | Club | Country | Level | Fit | Email | Expected ARR |
|------|------|---------|-------|-----|-------|-------------|
${tableRows || '| — | No hot leads yet — import clubs via CSV | — | — | — | — | — |'}

---

## Lead Details

${details || '_No hot leads yet. Run: `node qa/market-intel/pipeline.js --import`_'}

---

_To reach out: copy email from contact section above or visit their website/social._
`);

  return { hotLeads: hot.length, pipelineARR };
}

export function writeCountryOpportunityReport(leads) {
  const byCountry = {};
  leads.forEach(l => {
    const c = l.country || 'Unknown';
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(l);
  });

  const countries = Object.entries(byCountry).map(([country, cls]) => {
    const avgScore = cls.reduce((s, l) => s + (l.fitScore ?? 0), 0) / cls.length;
    const arr = cls.reduce((s, l) => s + expectedARR(l), 0);
    const hotLeads = cls.filter(l => (l.fitScore ?? 0) >= 7.5).length;
    const totalClubs = MARKET_SIZE[country] ?? null;
    return {
      country,
      leadsInDb: cls.length,
      hotLeads,
      avgScore: Math.round(avgScore * 10) / 10,
      arr,
      totalClubs,
      penetration: totalClubs ? `${((cls.length / totalClubs) * 100).toFixed(1)}%` : '—',
    };
  }).sort((a, b) => b.arr - a.arr);

  const totalARR = countries.reduce((s, c) => s + c.arr, 0);

  const tableRows = countries.map(c =>
    `| **${c.country}** | ${c.leadsInDb} | ${c.hotLeads} | ${c.avgScore} | **€${c.arr.toLocaleString()}** | ${c.totalClubs ? c.totalClubs.toLocaleString() : 'unknown'} | ${c.penetration} |`
  ).join('\n');

  const top5 = countries.slice(0, 5).map((c, i) =>
    `**${i + 1}. ${c.country}** — ${c.leadsInDb} leads in DB, €${c.arr.toLocaleString()} expected ARR${c.totalClubs ? `, ~${c.totalClubs.toLocaleString()} total clubs in market` : ''}`
  ).join('\n');

  write(join(REPORTS_DIR, 'COUNTRY_OPPORTUNITY_REPORT.md'), `# Country Opportunity Report

_Generated: ${new Date().toISOString()}_

---

## Market Overview

| Metric | Value |
|--------|-------|
| Countries in database | ${countries.length} |
| Total leads tracked | ${leads.length} |
| **Total expected pipeline ARR** | **€${totalARR.toLocaleString()}** |

---

## Opportunity by Country

| Country | Leads | Hot | Avg Score | Expected ARR | Est. Total Clubs | DB Penetration |
|---------|-------|-----|-----------|--------------|------------------|----------------|
${tableRows || '| — | 0 | 0 | — | €0 | — | — |'}

> **Est. Total Clubs**: rough estimates from public rugby federation data.
> **DB Penetration**: % of estimated total market we have in our database.
> **Expected ARR**: probability-weighted revenue at €${PRICE_ANNUAL}/yr per converting club.

---

## Top Opportunity Countries

${top5 || '_No leads in database yet._'}

---

_Add clubs: drop a CSV into \`qa/market-input/csv/\` then run \`node qa/market-intel/pipeline.js --import\`_
`);

  return { countries: countries.length, totalARR };
}

export function writeCompetitorPricingReport() {
  const comps = loadCompetitors();

  const tableRows = comps.map(c =>
    `| **${c.name}** | ${c.pricing || 'unknown'} | ${c.freeTier ? 'Yes' : 'No'} | ${c.rugbySpecific ? 'Yes' : 'No'} | ${(c.weaknesses || []).join(', ') || '—'} |`
  ).join('\n');

  write(join(REPORTS_DIR, 'COMPETITOR_PRICING_REPORT.md'), `# Competitor Pricing Report

_Generated: ${new Date().toISOString()}_

---

## Competitor Landscape

| Competitor | Pricing | Free Tier | Rugby-Specific | Weaknesses |
|------------|---------|-----------|----------------|-----------|
${tableRows || '| — | — | — | — | Add files to qa/market-input/competitors/ then run market-intel-agent.js |'}

---

## Coach's Eye Positioning

| Dimension | Coach's Eye | Typical Competitor |
|-----------|-------------|-------------------|
| Price point | **€70/month** | €25–200/month |
| Rugby-specific | ✅ Yes | ❌ Generic sports |
| Push notifications | ✅ Native | ⚠️ Varies |
| Coach → Player DMs | ✅ Yes | ❌ Usually no |
| Availability tracking | ✅ Yes | ⚠️ Varies |
| Onboarding | ✅ Invite link | ⚠️ Often complex |

---

## Pricing Recommendation

**€70/month** sits at the premium end for amateur clubs but is justified by rugby-specific focus, built-in communications, and zero-config onboarding.

Consider: **annual plan at €650/yr** (≈ €54/mo, saves clubs €190) to improve conversion and reduce early churn.

---

_Run \`node qa/market-intel-agent.js\` to analyse competitor pages from \`qa/market-input/competitors/\`_
`);

  return { competitors: comps.length };
}

export function writeSummaryJSON(leads) {
  const competitors = loadCompetitors();

  const byCountry = {};
  leads.forEach(l => {
    const c = l.country || 'Unknown';
    byCountry[c] = (byCountry[c] || 0) + 1;
  });

  const topCountries = Object.entries(byCountry)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const scored = leads.filter(l => l.fitScore !== null);
  const avgFitScore = scored.length
    ? Math.round(scored.reduce((s, l) => s + l.fitScore, 0) / scored.length * 10) / 10
    : 0;

  const hot = leads.filter(l => (l.fitScore ?? 0) >= 7.5 && l.status !== 'converted' && l.status !== 'not_fit');
  const totalExpectedARR = leads.reduce((s, l) => s + expectedARR(l), 0);

  const topLeads = hot.slice(0, 8).map(l => ({
    id: l.id,
    name: l.clubName,
    country: l.country,
    fitScore: l.fitScore,
    contact: l.email ? 'email' : (l.socialFacebook ? 'facebook' : 'none'),
    status: l.status,
    badge: badge(l.fitScore ?? 0),
    expectedARR: expectedARR(l),
  }));

  const topContacts = hot
    .filter(l => l.email && (l.status === 'new' || l.status === 'reviewed'))
    .slice(0, 5)
    .map(l => ({
      name: l.clubName,
      country: l.country,
      email: l.email,
      fitScore: l.fitScore,
      expectedARR: expectedARR(l),
    }));

  const statusBreakdown = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  const compSummary = competitors.map(c => ({
    name: c.name,
    pricing: c.pricing || null,
    freeTier: c.freeTier || false,
    rugbySpecific: c.rugbySpecific || false,
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    clubsReviewed: leads.length,
    competitorsReviewed: competitors.length,
    avgFitScore,
    strongLeads: leads.filter(l => (l.fitScore ?? 0) >= 8).length,
    hotLeads: hot.length,
    totalExpectedARR,
    topCountries,
    byCountry,
    topLeads,
    topContacts,
    statusBreakdown,
    competitorSummary: compSummary,
    topPainPoints: [],
    nextAction: hot.length > 0
      ? `Reach out to ${hot[0].clubName} — top-scoring lead (${hot[0].fitScore}/10)`
      : 'Import clubs via CSV to populate the pipeline',
    pricingRec: '€70/month or €650/year',
    analysisMode: 'pipeline',
  };

  ensure(REPORTS_DIR);
  writeFileSync(join(REPORTS_DIR, 'market-intel-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}
