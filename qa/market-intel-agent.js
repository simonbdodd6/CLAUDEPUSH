/**
 * qa/market-intel-agent.js — Coach's Eye Market Intelligence Agent
 *
 * Reads manually-provided files and URLs, extracts structured market data
 * using Claude, scores club leads, and produces three reports:
 *
 *   qa/market-reports/CLUB_LEADS_REPORT.md
 *   qa/market-reports/COMPETITOR_PRICING_REPORT.md
 *   qa/market-reports/MARKET_INTELLIGENCE_REPORT.md
 *   qa/market-reports/market-intel-summary.json   ← consumed by Mission Control
 *
 * Usage:
 *   node qa/market-intel-agent.js
 *   node qa/market-intel-agent.js --dry-run        # skip API calls, heuristic only
 *   node qa/market-intel-agent.js --verbose
 *
 * Input directories:
 *   qa/market-input/clubs/       — any .txt or .html about a rugby club
 *   qa/market-input/competitors/ — any .txt or .html about a competing product
 *   qa/market-input/urls.txt     — one URL per line (fetched politely, single page)
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — optional; falls back to heuristic mode without it
 *   MI_MODEL           — override model (default: claude-haiku-4-5-20251001)
 *
 * Safe constraints:
 *   - Never scrapes automatically
 *   - Never sends email
 *   - Fetches at most one page per URL with a 10s timeout
 *   - Respects manually-provided content only
 */

import fs   from 'node:fs';
import path from 'node:path';

const ROOT         = process.cwd();
const INPUT_DIR    = path.join(ROOT, 'qa/market-input');
const CLUBS_DIR    = path.join(INPUT_DIR, 'clubs');
const COMPS_DIR    = path.join(INPUT_DIR, 'competitors');
const URLS_FILE    = path.join(INPUT_DIR, 'urls.txt');
const REPORTS_DIR  = path.join(ROOT, 'qa/market-reports');

const SUMMARY_JSON = path.join(REPORTS_DIR, 'market-intel-summary.json');
const CLUB_RPT     = path.join(REPORTS_DIR, 'CLUB_LEADS_REPORT.md');
const COMP_RPT     = path.join(REPORTS_DIR, 'COMPETITOR_PRICING_REPORT.md');
const MARKET_RPT   = path.join(REPORTS_DIR, 'MARKET_INTELLIGENCE_REPORT.md');

const API_KEY  = process.env.ANTHROPIC_API_KEY;
const MODEL    = process.env.MI_MODEL ?? 'claude-haiku-4-5-20251001';
const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');

const MAX_CONTENT = 18_000; // chars sent to Claude per file

// ─── Claude API ──────────────────────────────────────────────────────────────

async function callClaude(userContent, systemPrompt) {
  if (!API_KEY || DRY_RUN) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1500,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[market-intel] Claude API ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    if (VERBOSE) console.error(`[market-intel] Claude call failed: ${err.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── URL fetcher (single page, polite) ───────────────────────────────────────

async function fetchUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CoachsEye-MarketResearch/1.0 (manual research tool)' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Strip tags and collapse whitespace for clean text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .trim();
    return text.slice(0, MAX_CONTENT);
  } catch (err) {
    console.warn(`[market-intel] Could not fetch ${url}: ${err.message}`);
    return null;
  }
}

// ─── Heuristic fallbacks (no API key) ────────────────────────────────────────

function heuristicClub(content, source) {
  const text = content.toLowerCase();
  const record = {
    source_file:         source,
    club_name:           extractClubName(content),
    country:             detectCountry(text),
    level:               detectLevel(text),
    contact_type:        detectContact(text),
    has_modern_website:  detectModernWebsite(text),
    uses_social_instead: /facebook\.com|instagram\.com|fb\.com/i.test(text) &&
                         !/<html/i.test(content) && text.length < 3000,
    pain_points:         detectPainPoints(text),
    fit_score:           null,
    fit_reasoning:       'Heuristic analysis — set ANTHROPIC_API_KEY for Claude-powered extraction',
    notes:               '',
    _source:             'heuristic',
  };
  record.fit_score = computeFitScore(record);
  return record;
}

function heuristicCompetitor(content, source) {
  const text = content.toLowerCase();
  return {
    source_file:              source,
    product_name:             extractProductName(content),
    pricing_model:            detectPricingModel(text),
    price_points:             extractPricePoints(text),
    target_customer:          detectTarget(text),
    key_features:             detectFeatures(text),
    weaknesses:               [],
    coaches_eye_advantage:    [],
    notes:                    '',
    _source:                  'heuristic',
  };
}

// ─── Simple text extractors used by heuristic mode ───────────────────────────

function extractClubName(content) {
  const m = content.match(/([A-Z][A-Za-z\s''-]{3,40}(?:RFC|RC|Rugby Club|Rugby|FC|AFC))/);
  return m?.[1]?.trim() ?? path.basename(content).replace(/\.[^.]+$/, '');
}

function extractProductName(content) {
  const m = content.match(/(?:^|\n)([\w\s.'-]{2,30})(?:\s*[-—|]\s*(?:sports|team|club|coaching|rugby|scheduling|app|platform|management))/i);
  return m?.[1]?.trim() ?? 'Unknown product';
}

function detectCountry(text) {
  const map = {
    'ireland':       'Ireland',
    'irish':         'Ireland',
    '.ie':           'Ireland',
    'france':        'France',
    'french':        'France',
    '.fr':           'France',
    'england':       'England',
    'uk':            'UK',
    'scotland':      'Scotland',
    'wales':         'Wales',
    'south africa':  'South Africa',
    'south african': 'South Africa',
    '.za':           'South Africa',
    'australia':     'Australia',
    'australian':    'Australia',
    'new zealand':   'New Zealand',
    'belgium':       'Belgium',
    'italian':       'Italy',
    'italy':         'Italy',
  };
  for (const [kw, country] of Object.entries(map)) {
    if (text.includes(kw)) return country;
  }
  return 'Unknown';
}

function detectLevel(text) {
  if (/premiership|pro14|top 14|super rugby|professional|fulltime|full.time player/i.test(text)) return 'professional';
  if (/semi.pro|semi pro|national league division 1|division 1|league 1/i.test(text)) return 'semi_pro';
  if (/under.?18|under.?16|under.?14|under.?12|u18|u16|u14|youth|mini|juvenile/i.test(text)) return 'youth';
  if (/amateur|club rugby|weekend|community|grassroots|local league|division/i.test(text)) return 'adult_amateur';
  return 'unknown';
}

function detectContact(text) {
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return 'email';
  if (/contact.?form|contact us form|enquiry form/i.test(text)) return 'form';
  if (/facebook\.com|instagram\.com/i.test(text)) return 'social_only';
  return 'none';
}

function detectModernWebsite(text) {
  // Presence of modern tech indicators
  return /wordpress|wix|squarespace|webflow|react|angular|vue|bootstrap|tailwind/i.test(text);
}

function detectPainPoints(text) {
  const points = [];
  if (/spread.*?sheet|excel|google sheet/i.test(text)) points.push('Uses spreadsheets for squad management');
  if (/whatsapp|text message|sms|phone call/i.test(text)) points.push('Communication via WhatsApp/SMS — no structured comms');
  if (/paper|printed|print out/i.test(text)) points.push('Paper-based admin processes');
  if (/hard to reach|no response|unreachable/i.test(text)) points.push('Players hard to reach');
  if (/availability.*?difficult|not knowing who/i.test(text)) points.push('Availability tracking is manual/difficult');
  if (/website.*?old|outdated.*?site|needs.*?update/i.test(text)) points.push('Website is outdated or basic');
  if (/volunteer|unpaid|no budget|small budget/i.test(text)) points.push('Volunteer-run — limited budget for tools');
  return points;
}

function detectPricingModel(text) {
  if (/free.*?plan|free tier|freemium/i.test(text)) return 'freemium';
  if (/free\b/i.test(text) && !/paid|subscription|premium|price/i.test(text)) return 'free';
  if (/per month|\/month|monthly/i.test(text)) return 'subscription_monthly';
  if (/per year|\/year|annual/i.test(text)) return 'subscription_annual';
  if (/one.?time|lifetime|single payment/i.test(text)) return 'one_time';
  return 'unknown';
}

function extractPricePoints(text) {
  const points = [];
  const patterns = [
    /[€£$]\s*\d+(?:\.\d{2})?(?:\s*\/\s*(?:mo|month|yr|year|team|user))?/gi,
    /\d+(?:\.\d{2})?\s*(?:EUR|GBP|USD|€|£|\$)(?:\s*\/\s*(?:mo|month|yr|year|team|user))?/gi,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    points.push(...matches.map(m => m.trim()));
  }
  return [...new Set(points)].slice(0, 6);
}

function detectTarget(text) {
  if (/amateur.*?club|grassroots|community/i.test(text)) return 'Amateur clubs';
  if (/professional|elite|academy/i.test(text)) return 'Professional / elite clubs';
  if (/youth|school|junior/i.test(text)) return 'Youth and school clubs';
  if (/all sport|any sport|multi.?sport/i.test(text)) return 'Generic sports teams (all sports)';
  if (/rugby/i.test(text)) return 'Rugby clubs specifically';
  return 'Sports teams (general)';
}

function detectFeatures(text) {
  const features = [];
  if (/availability/i.test(text)) features.push('Availability tracking');
  if (/messaging|chat|communication/i.test(text)) features.push('Team messaging');
  if (/schedule|fixture|calendar/i.test(text)) features.push('Fixture / schedule management');
  if (/payment|subscription|dues|membership fee/i.test(text)) features.push('Payment collection');
  if (/video|analysis|performance/i.test(text)) features.push('Video / performance analysis');
  if (/training|session|drill/i.test(text)) features.push('Training planning');
  if (/notification|push|alert/i.test(text)) features.push('Push notifications');
  if (/mobile.*?app|ios|android/i.test(text)) features.push('Mobile app');
  return features;
}

// ─── Fit scoring ──────────────────────────────────────────────────────────────
//
// Deterministic layer applied on top of (or instead of) Claude's score.
// Weights derived from first-customer targeting strategy in FIRST_CUSTOMER_PLAN.md:
//   - Small/medium amateur adult clubs are the primary target
//   - Irish, French, and South African clubs preferred for initial outreach
//   - Pain points signal buying motivation
//   - Modern website or known tools = lower urgency

const HIGH_VALUE_COUNTRIES = new Set(['Ireland', 'France', 'Belgium', 'South Africa', 'New Zealand', 'Australia', 'England', 'Scotland', 'Wales', 'UK']);

function computeFitScore(record) {
  let score = 5.0;

  // Level
  if (record.level === 'adult_amateur') score += 2.0;
  else if (record.level === 'youth')    score += 1.2;
  else if (record.level === 'semi_pro') score -= 0.5;
  else if (record.level === 'professional') score -= 2.5;

  // Country
  if (HIGH_VALUE_COUNTRIES.has(record.country)) score += 0.5;

  // Digital pain signals
  if (record.uses_social_instead)    score += 1.2; // Facebook IS their website = high pain
  if (!record.has_modern_website)    score += 0.5;
  if (record.pain_points.length >= 3) score += 0.8;
  else if (record.pain_points.length >= 1) score += 0.3;

  // Reachability
  if (record.contact_type === 'email')  score += 0.4;
  if (record.contact_type === 'none')   score -= 0.8;

  // Penalty signals
  if (record.has_modern_website && record.pain_points.length === 0) score -= 0.5;

  const deterministic = Math.min(10, Math.max(1, score));

  // Blend with Claude's score if present (60/40)
  if (record._claude_fit_score && typeof record._claude_fit_score === 'number') {
    return Math.round((record._claude_fit_score * 0.6 + deterministic * 0.4) * 10) / 10;
  }
  return Math.round(deterministic * 10) / 10;
}

// ─── Claude-powered club extraction ──────────────────────────────────────────

const CLUB_SYSTEM_PROMPT = `You are a rugby market intelligence analyst for Coach's Eye, a coaching app targeting small/medium amateur rugby clubs. Extract structured data from the provided content.

Return ONLY valid JSON with this exact shape:
{
  "club_name": "string",
  "country": "string (e.g. Ireland, France, UK, South Africa, New Zealand, Australia, Belgium, Italy — or 'Unknown')",
  "level": "adult_amateur | youth | semi_pro | professional | unknown",
  "contact_type": "email | form | social_only | none",
  "email_found": "string or null",
  "has_modern_website": true/false,
  "uses_social_instead": true/false,
  "pain_points": ["string"],
  "fit_score": 1-10,
  "fit_reasoning": "string (1-2 sentences)",
  "notes": "string (any other useful detail for sales outreach)"
}

Fit score guide:
9-10: Amateur club, clear pain, no digital tools, direct contact available
7-8:  Amateur club, some digital presence but gap for coaching tools
5-6:  Unclear level, partial digital, possible fit
3-4:  Large/semi-pro club, different budget tier
1-2:  Professional, already has solutions, or wrong sport

If data is not found for a field, use null or an empty array. Do not guess country from club name alone.`;

async function analyzeClub(content, source) {
  const truncated = content.slice(0, MAX_CONTENT);
  const result = await callClaude(
    `Source file: ${source}\n\nContent:\n${truncated}`,
    CLUB_SYSTEM_PROMPT
  );

  if (!result) return heuristicClub(content, source);

  const record = {
    source_file:         source,
    club_name:           result.club_name ?? 'Unknown',
    country:             result.country   ?? 'Unknown',
    level:               result.level     ?? 'unknown',
    contact_type:        result.contact_type ?? 'none',
    email_found:         result.email_found  ?? null,
    has_modern_website:  Boolean(result.has_modern_website),
    uses_social_instead: Boolean(result.uses_social_instead),
    pain_points:         Array.isArray(result.pain_points) ? result.pain_points : [],
    _claude_fit_score:   typeof result.fit_score === 'number' ? result.fit_score : null,
    fit_reasoning:       result.fit_reasoning ?? '',
    notes:               result.notes ?? '',
    _source:             `Claude (${MODEL})`,
  };
  record.fit_score = computeFitScore(record);
  return record;
}

// ─── Claude-powered competitor extraction ─────────────────────────────────────

const COMPETITOR_SYSTEM_PROMPT = `You are a competitive intelligence analyst for Coach's Eye, a rugby coaching app. Extract structured data from the provided competitor product page.

Return ONLY valid JSON with this exact shape:
{
  "product_name": "string",
  "company": "string or null",
  "pricing_model": "free | freemium | subscription_monthly | subscription_annual | one_time | unknown",
  "price_points": ["string (e.g. '€25/month per team', 'Free up to 15 players')"],
  "free_tier": true/false,
  "target_customer": "string",
  "sport_specific": "rugby | generic_sports | unknown",
  "key_features": ["string"],
  "missing_features": ["string (notable gaps vs a modern coaching app)"],
  "weaknesses": ["string"],
  "coaches_eye_advantage": ["string (specific ways Coach's Eye is or could be better)"],
  "url": "string or null",
  "notes": "string"
}

Be specific about pricing — extract exact numbers if visible. If no pricing is shown, say 'pricing not public'.`;

async function analyzeCompetitor(content, source) {
  const truncated = content.slice(0, MAX_CONTENT);
  const result = await callClaude(
    `Source file: ${source}\n\nContent:\n${truncated}`,
    COMPETITOR_SYSTEM_PROMPT
  );

  if (!result) return heuristicCompetitor(content, source);

  return {
    source_file:            source,
    product_name:           result.product_name       ?? 'Unknown',
    company:                result.company             ?? null,
    pricing_model:          result.pricing_model       ?? 'unknown',
    price_points:           Array.isArray(result.price_points) ? result.price_points : [],
    free_tier:              Boolean(result.free_tier),
    target_customer:        result.target_customer     ?? 'Unknown',
    sport_specific:         result.sport_specific      ?? 'unknown',
    key_features:           Array.isArray(result.key_features) ? result.key_features : [],
    missing_features:       Array.isArray(result.missing_features) ? result.missing_features : [],
    weaknesses:             Array.isArray(result.weaknesses) ? result.weaknesses : [],
    coaches_eye_advantage:  Array.isArray(result.coaches_eye_advantage) ? result.coaches_eye_advantage : [],
    url:                    result.url ?? null,
    notes:                  result.notes ?? '',
    _source:                `Claude (${MODEL})`,
  };
}

// ─── Input scanning ───────────────────────────────────────────────────────────

function readTextFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(txt|html|htm|md)$/i.test(f))
    .map(f => ({ file: f, content: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

async function processUrlFile() {
  if (!fs.existsSync(URLS_FILE)) return { clubs: [], competitors: [] };

  const lines = fs.readFileSync(URLS_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  const clubs       = [];
  const competitors = [];

  for (const line of lines) {
    // Format: [club:|competitor:]URL
    const isCompetitor = /^competitor:/i.test(line);
    const url = line.replace(/^(club|competitor):\s*/i, '');
    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[market-intel] Skipping non-HTTP URL: ${url}`);
      continue;
    }

    console.log(`[market-intel] Fetching ${url}…`);
    const content = await fetchUrl(url);
    if (!content) continue;
    await sleep(500);

    if (isCompetitor) {
      const record = await analyzeCompetitor(content, url);
      competitors.push(record);
    } else {
      const record = await analyzeClub(content, url);
      clubs.push(record);
    }
    await sleep(500);
  }

  return { clubs, competitors };
}

// ─── Report writers ───────────────────────────────────────────────────────────

function scoreBar(score) {
  const filled = Math.round(score);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/10`;
}

function fitBadge(score) {
  if (score >= 8) return '🟢 Strong fit';
  if (score >= 6) return '🟡 Possible fit';
  if (score >= 4) return '🟠 Weak fit';
  return '🔴 Poor fit';
}

function writeClubLeadsReport(clubs) {
  const sorted = [...clubs].sort((a, b) => b.fit_score - a.fit_score);
  const now = new Date().toISOString();

  const rows = sorted.map((c, i) =>
    `| ${i + 1} | ${c.club_name} | ${c.country} | ${c.level} | ${fitBadge(c.fit_score)} \`${c.fit_score}\` | ${c.contact_type} |`
  ).join('\n');

  const detail = sorted.map(c => `
### ${c.club_name} — ${c.country} \`${c.fit_score}/10\`
${fitBadge(c.fit_score)} | Level: ${c.level} | Contact: ${c.contact_type}${c.email_found ? ` (${c.email_found})` : ''}

**Fit score:** ${scoreBar(c.fit_score)}

**Pain points identified:**
${c.pain_points.length ? c.pain_points.map(p => `- ${p}`).join('\n') : '- None identified'}

**Digital presence:** ${c.has_modern_website ? 'Has modern website' : 'No modern website'}${c.uses_social_instead ? ' · Uses social media as primary presence' : ''}

**Reasoning:** ${c.fit_reasoning || '(heuristic analysis)'}

${c.notes ? `**Notes:** ${c.notes}` : ''}

_Source: ${c.source_file} · Analysis: ${c._source}_
`).join('\n---\n');

  const strongFit   = sorted.filter(c => c.fit_score >= 8);
  const possibleFit = sorted.filter(c => c.fit_score >= 6 && c.fit_score < 8);
  const countries   = countBy(sorted, 'country');

  const content = `# Club Leads Report

_Generated: ${now}_
_Total clubs reviewed: ${clubs.length}_

---

## Summary

| Tier | Count |
|------|-------|
| 🟢 Strong fit (8–10) | ${strongFit.length} |
| 🟡 Possible fit (6–7.9) | ${possibleFit.length} |
| 🟠/🔴 Low fit (< 6) | ${sorted.length - strongFit.length - possibleFit.length} |

**Top countries:**
${Object.entries(countries).sort((a,b) => b[1]-a[1]).slice(0,5).map(([c,n]) => `- ${c}: ${n} club${n>1?'s':''}`).join('\n')}

---

## All Clubs — Ranked by Fit Score

| Rank | Club | Country | Level | Fit | Contact |
|------|------|---------|-------|-----|---------|
${rows}

---

## Club Details

${detail}

---

_Analysis: ${API_KEY && !DRY_RUN ? `Claude API (${MODEL})` : 'Heuristic fallback (set ANTHROPIC_API_KEY for AI-powered analysis)'}_
`;

  fs.writeFileSync(CLUB_RPT, content);
  if (VERBOSE) console.log(`[market-intel] Wrote ${CLUB_RPT}`);
}

function writeCompetitorPricingReport(competitors) {
  const now = new Date().toISOString();

  const rows = competitors.map(c =>
    `| ${c.product_name} | ${c.pricing_model} | ${c.price_points.slice(0,2).join(', ') || 'Not public'} | ${c.free_tier ? 'Yes' : 'No'} | ${c.target_customer} | ${c.sport_specific} |`
  ).join('\n');

  const detail = competitors.map(c => `
### ${c.product_name}${c.company ? ` (${c.company})` : ''}
${c.url ? `_${c.url}_` : ''}

**Pricing model:** ${c.pricing_model}
**Price points:** ${c.price_points.length ? c.price_points.join(' · ') : 'Not publicly listed'}
**Free tier:** ${c.free_tier ? 'Yes' : 'No'}
**Target customer:** ${c.target_customer}
**Sport focus:** ${c.sport_specific}

**Key features:**
${c.key_features.length ? c.key_features.map(f => `- ${f}`).join('\n') : '- Not identified'}

**Weaknesses / gaps:**
${c.weaknesses.length ? c.weaknesses.map(w => `- ${w}`).join('\n') : '- Not identified'}

**Missing features:**
${c.missing_features?.length ? c.missing_features.map(f => `- ${f}`).join('\n') : '- Not identified'}

**Coach's Eye advantages:**
${c.coaches_eye_advantage.length ? c.coaches_eye_advantage.map(a => `- ${a}`).join('\n') : '- To be determined'}

${c.notes ? `**Notes:** ${c.notes}` : ''}

_Source: ${c.source_file} · Analysis: ${c._source}_
`).join('\n---\n');

  const content = `# Competitor Pricing Report

_Generated: ${now}_
_Competitors reviewed: ${competitors.length}_

---

## Pricing Summary

| Product | Model | Price Points | Free Tier | Target | Sport |
|---------|-------|-------------|-----------|--------|-------|
${rows}

---

## Competitor Details

${detail}

---

_Analysis: ${API_KEY && !DRY_RUN ? `Claude API (${MODEL})` : 'Heuristic fallback (set ANTHROPIC_API_KEY for AI-powered analysis)'}_
`;

  fs.writeFileSync(COMP_RPT, content);
  if (VERBOSE) console.log(`[market-intel] Wrote ${COMP_RPT}`);
}

async function writeMarketIntelReport(clubs, competitors) {
  const now = new Date().toISOString();
  const strongLeads = clubs.filter(c => c.fit_score >= 8);
  const avgScore    = clubs.length
    ? Math.round((clubs.reduce((s, c) => s + c.fit_score, 0) / clubs.length) * 10) / 10
    : 0;
  const countries   = countBy(clubs, 'country');
  const topCountry  = Object.entries(countries).sort((a,b) => b[1]-a[1])[0]?.[0] ?? 'Unknown';
  const rugbySpecific = competitors.filter(c => c.sport_specific === 'rugby').length;
  const genericTools  = competitors.filter(c => c.sport_specific === 'generic_sports').length;

  // Ask Claude for synthesis if available
  let synthesis = null;
  if (API_KEY && !DRY_RUN && (clubs.length > 0 || competitors.length > 0)) {
    const summary = {
      clubs_count: clubs.length,
      avg_fit_score: avgScore,
      strong_leads: strongLeads.length,
      top_countries: Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5),
      common_pain_points: topPainPoints(clubs),
      competitors_count: competitors.length,
      rugby_specific_competitors: rugbySpecific,
      generic_competitors: genericTools,
      competitor_price_range: competitorPriceRange(competitors),
    };

    synthesis = await callClaude(
      `Market data summary:\n${JSON.stringify(summary, null, 2)}\n\nBased on this market intelligence data for Coach's Eye (a rugby coaching app targeting amateur clubs), provide a strategic analysis. Return JSON with:
{
  "market_opportunity": "2-3 sentence assessment",
  "pricing_recommendation": "specific recommendation with reasoning",
  "top_sales_action": "the single most valuable next sales action",
  "positioning_gap": "the gap Coach's Eye can own vs competitors",
  "risks": ["string"],
  "recommended_sprint": ["string — specific feature or action, max 5 items"]
}`,
      'You are a product strategist and market analyst specializing in sports technology and coaching apps. Be specific and actionable. Return only valid JSON.'
    );
    await sleep(500);
  }

  const sprintItems = synthesis?.recommended_sprint ?? defaultSprint(clubs, competitors);
  const pricingRec  = synthesis?.pricing_recommendation ?? defaultPricingRec(competitors);
  const opportunity = synthesis?.market_opportunity ?? defaultOpportunity(clubs);
  const salesAction = synthesis?.top_sales_action ?? defaultSalesAction(strongLeads, topCountry);

  const content = `# Market Intelligence Report

_Generated: ${now}_

---

## Executive Summary

${opportunity}

**Clubs reviewed:** ${clubs.length} · **Average fit score:** ${avgScore}/10 · **Strong leads:** ${strongLeads.length}
**Competitors analysed:** ${competitors.length} (${rugbySpecific} rugby-specific, ${genericTools} generic)

---

## Market Opportunity

### Top Lead Countries
${Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,n]) => `- **${c}**: ${n} club${n>1?'s':''}`).join('\n') || '- No clubs analysed yet'}

### Common Pain Points Across Clubs
${topPainPoints(clubs).map(p => `- ${p}`).join('\n') || '- No data yet'}

### Positioning Gap vs Competitors
${synthesis?.positioning_gap ?? '_Add competitor files to qa/market-input/competitors/ to generate this analysis_'}

---

## Competitor Pricing Landscape

${competitors.length ? `
| Product | Pricing | Rugby-Specific | Free Tier |
|---------|---------|---------------|-----------|
${competitors.map(c => `| ${c.product_name} | ${c.price_points.slice(0,1).join(', ') || c.pricing_model} | ${c.sport_specific === 'rugby' ? '✅' : '❌'} | ${c.free_tier ? '✅' : '❌'} |`).join('\n')}
` : '_No competitors analysed yet. Add files to qa/market-input/competitors/_'}

### Pricing Recommendation
${pricingRec}

---

## Recommended Next Action

> **${salesAction}**

---

## Recommended Next Sprint

${sprintItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

---

## Risks

${synthesis?.risks?.map(r => `- ${r}`).join('\n') ?? defaultRisks(clubs, competitors)}

---

_Analysis: ${API_KEY && !DRY_RUN ? `Claude API (${MODEL})` : 'Heuristic fallback — set ANTHROPIC_API_KEY for AI-powered synthesis'}_
`;

  fs.writeFileSync(MARKET_RPT, content);
  if (VERBOSE) console.log(`[market-intel] Wrote ${MARKET_RPT}`);
  return { synthesis, sprintItems, pricingRec, opportunity, salesAction };
}

// ─── Default fallbacks for synthesis fields ───────────────────────────────────

function defaultSprint(clubs, competitors) {
  const items = ['Implement player approval email (2h — Resend already configured)'];
  if (clubs.some(c => c.country === 'Ireland' && c.fit_score >= 7))
    items.push('Direct outreach to high-score Irish clubs identified in CLUB_LEADS_REPORT.md');
  if (competitors.some(c => c.free_tier))
    items.push('Define Coach\'s Eye free tier offering to compete with freemium competitors');
  items.push('Stripe billing integration (10–12h) — hard blocker for first paying customer');
  items.push('Add club-name-first onboarding copy to reduce bounce on signup form');
  return items.slice(0, 5);
}

function defaultPricingRec(competitors) {
  const prices = competitorPriceRange(competitors);
  if (!prices.min) return 'Insufficient competitor data. Add competitor files to generate pricing recommendation.';
  return `Competitors range from ${prices.min} to ${prices.max}. Recommend a €${Math.round((prices.minNum + 5))}–€${Math.round((prices.maxNum - 5))}/month team plan positioned below Pitchero/TeamApp but with rugby-specific features as differentiation.`;
}

function defaultOpportunity(clubs) {
  if (!clubs.length) return 'No clubs analysed yet. Add club files to qa/market-input/clubs/ to generate market analysis.';
  const strong = clubs.filter(c => c.fit_score >= 8).length;
  return `Initial scan of ${clubs.length} rugby clubs found ${strong} strong leads. The primary opportunity is amateur clubs using Facebook/WhatsApp as their only digital tool — no modern coaching app is serving this segment with rugby-specific features at a fair price.`;
}

function defaultSalesAction(strongLeads, topCountry) {
  if (!strongLeads.length) return 'Add more club files to identify outreach targets';
  return `Contact the top ${Math.min(3, strongLeads.length)} ${topCountry} clubs with a personalised demo offer — they score 8+ and have no modern digital tools`;
}

function defaultRisks(clubs, competitors) {
  const risks = [
    '- **Price sensitivity**: Amateur clubs are volunteer-run; price point must stay below €30/month',
    '- **Adoption inertia**: Coaches used to WhatsApp groups may resist change even when pain is high',
    '- **Competitor free tiers**: Generic tools offering free tiers may be "good enough" for low-engagement clubs',
  ];
  if (!clubs.length) risks.push('- **Insufficient data**: Add club research files to generate data-driven risk assessment');
  return risks.join('\n');
}

function competitorPriceRange(competitors) {
  const allPrices = competitors.flatMap(c => c.price_points)
    .map(p => {
      const m = p.match(/(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : null;
    })
    .filter(Boolean)
    .sort((a,b) => a-b);
  if (!allPrices.length) return { min: null, max: null, minNum: 0, maxNum: 0 };
  return {
    min: `€${allPrices[0]}`,
    max: `€${allPrices[allPrices.length - 1]}`,
    minNum: allPrices[0],
    maxNum: allPrices[allPrices.length - 1],
  };
}

function topPainPoints(clubs) {
  const counts = {};
  for (const club of clubs) {
    for (const p of (club.pain_points ?? [])) {
      counts[p] = (counts[p] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 5)
    .map(([p, n]) => `${p} (${n} club${n>1?'s':''})`);
}

function countBy(arr, key) {
  const result = {};
  for (const item of arr) {
    const v = item[key] ?? 'Unknown';
    result[v] = (result[v] ?? 0) + 1;
  }
  return result;
}

// ─── Summary JSON for Mission Control dashboard ───────────────────────────────

function writeSummaryJson(clubs, competitors, synthesis) {
  const sorted   = [...clubs].sort((a,b) => b.fit_score - a.fit_score);
  const avgScore = clubs.length
    ? Math.round((clubs.reduce((s,c) => s + c.fit_score, 0) / clubs.length) * 10) / 10
    : 0;
  const countries = countBy(clubs, 'country');

  const summary = {
    generatedAt:          new Date().toISOString(),
    clubsReviewed:        clubs.length,
    competitorsReviewed:  competitors.length,
    avgFitScore:          avgScore,
    strongLeads:          clubs.filter(c => c.fit_score >= 8).length,
    topCountries:         Object.entries(countries).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([country, count]) => ({ country, count })),
    topLeads:             sorted.slice(0, 5).map(c => ({
      name:       c.club_name,
      country:    c.country,
      fitScore:   c.fit_score,
      contact:    c.contact_type,
      badge:      fitBadge(c.fit_score),
    })),
    competitorSummary:    competitors.map(c => ({
      name:        c.product_name,
      pricing:     c.price_points.slice(0,1).join(', ') || c.pricing_model,
      freeTier:    c.free_tier,
      rugbySpecific: c.sport_specific === 'rugby',
    })),
    topPainPoints:        topPainPoints(clubs),
    nextAction:           synthesis?.top_sales_action ?? (clubs.length
      ? `Reach out to ${sorted[0]?.club_name} — top-scoring lead`
      : 'Add club files to qa/market-input/clubs/ to begin analysis'),
    pricingRec:           synthesis?.pricing_recommendation ?? null,
    recommendedSprint:    synthesis?.recommended_sprint ?? null,
    analysisMode:         API_KEY && !DRY_RUN ? `Claude (${MODEL})` : 'heuristic',
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  if (VERBOSE) console.log(`[market-intel] Wrote ${SUMMARY_JSON}`);
  return summary;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Coach\'s Eye Market Intelligence Agent');
  console.log(`  Mode: ${API_KEY && !DRY_RUN ? `Claude API (${MODEL})` : DRY_RUN ? 'dry-run (heuristic)' : 'heuristic (no ANTHROPIC_API_KEY)'}`);
  console.log('═══════════════════════════════════════════════════\n');

  fs.mkdirSync(CLUBS_DIR,    { recursive: true });
  fs.mkdirSync(COMPS_DIR,    { recursive: true });
  fs.mkdirSync(REPORTS_DIR,  { recursive: true });

  // ── Scan local files ────────────────────────────────────────────────────
  const clubFiles = readTextFiles(CLUBS_DIR);
  const compFiles = readTextFiles(COMPS_DIR);

  console.log(`  Clubs to process:       ${clubFiles.length}`);
  console.log(`  Competitors to process: ${compFiles.length}`);
  console.log(`  URL file:               ${fs.existsSync(URLS_FILE) ? 'found' : 'not found'}\n`);

  if (clubFiles.length === 0 && compFiles.length === 0 && !fs.existsSync(URLS_FILE)) {
    console.log('  ⚠  No input files found.');
    console.log('  Add .txt or .html files to:');
    console.log('    qa/market-input/clubs/       (rugby club pages)');
    console.log('    qa/market-input/competitors/ (competitor product pages)');
    console.log('    qa/market-input/urls.txt     (URLs to fetch)');
    console.log('\n  See qa/market-input/examples/ for format reference.\n');
    // Still write empty reports so dashboard shows "no data yet" state
    writeSummaryJson([], [], null);
    return;
  }

  // ── Process club files ──────────────────────────────────────────────────
  const clubs = [];
  for (const { file, content } of clubFiles) {
    process.stdout.write(`  Analysing club: ${file}… `);
    const record = await analyzeClub(content, file);
    clubs.push(record);
    console.log(`${record.club_name} — score ${record.fit_score}/10 [${record._source}]`);
    await sleep(400);
  }

  // ── Process competitor files ────────────────────────────────────────────
  const competitors = [];
  for (const { file, content } of compFiles) {
    process.stdout.write(`  Analysing competitor: ${file}… `);
    const record = await analyzeCompetitor(content, file);
    competitors.push(record);
    console.log(`${record.product_name} [${record._source}]`);
    await sleep(400);
  }

  // ── Process URLs ────────────────────────────────────────────────────────
  const { clubs: urlClubs, competitors: urlComps } = await processUrlFile();
  clubs.push(...urlClubs);
  competitors.push(...urlComps);

  console.log(`\n  Total clubs analysed:       ${clubs.length}`);
  console.log(`  Total competitors analysed: ${competitors.length}\n`);

  // ── Write reports ───────────────────────────────────────────────────────
  if (clubs.length)       writeClubLeadsReport(clubs);
  if (competitors.length) writeCompetitorPricingReport(competitors);
  const { synthesis }   = await writeMarketIntelReport(clubs, competitors);
  const summary         = writeSummaryJson(clubs, competitors, synthesis);

  // ── Print summary ───────────────────────────────────────────────────────
  console.log('══════════════════════════════════');
  console.log(' Reports written:');
  if (clubs.length)       console.log(`   qa/market-reports/CLUB_LEADS_REPORT.md`);
  if (competitors.length) console.log(`   qa/market-reports/COMPETITOR_PRICING_REPORT.md`);
  console.log(`   qa/market-reports/MARKET_INTELLIGENCE_REPORT.md`);
  console.log(`   qa/market-reports/market-intel-summary.json`);
  console.log('');
  if (clubs.length) {
    console.log(` 📊 Avg fit score:    ${summary.avgFitScore}/10`);
    console.log(` 🟢 Strong leads:     ${summary.strongLeads}`);
    console.log(` 🌍 Top country:      ${summary.topCountries[0]?.country ?? 'n/a'}`);
  }
  if (summary.nextAction) {
    console.log(` 🎯 Next action:      ${summary.nextAction}`);
  }
  console.log('══════════════════════════════════\n');
}

main().catch(err => {
  console.error('[market-intel] Fatal error:', err.message);
  process.exit(1);
});
