/**
 * Text normalization for rugby knowledge items.
 * Pure functions — no I/O, no side effects.
 */

import { basename, extname } from 'node:path';

// Strip HTML tags and decode common entities
export function stripHTML(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// Collapse whitespace, remove control chars
export function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Derive a human-readable title from a filename
export function titleFromFilename(filePath) {
  const base = basename(filePath, extname(filePath));
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Extract a date from text using common patterns
export function extractDate(text) {
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,                                     // 2024-01-15
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,                      // 15/01/2024
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i,  // 15 Jan 2024
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i, // January 15, 2024
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch {}
    }
  }
  return null;
}

// Extract the most likely title from content
export function extractTitle(text, filePath) {
  const lines = cleanText(text).split('\n').filter(l => l.trim());

  // Look for markdown heading
  for (const line of lines.slice(0, 5)) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m) return m[1].trim().slice(0, 120);
  }

  // First non-trivial line (> 15 chars, not a URL, not all caps metadata)
  for (const line of lines.slice(0, 8)) {
    const t = line.trim();
    if (t.length >= 15 && t.length <= 150 && !/^https?:\/\//.test(t) && !/^[A-Z\s:]{20,}$/.test(t)) {
      return t.slice(0, 120);
    }
  }

  return titleFromFilename(filePath);
}

// Extract country/competition mentions
export function extractContext(text) {
  const COUNTRIES = ['England', 'Ireland', 'Scotland', 'Wales', 'France', 'South Africa',
    'New Zealand', 'Australia', 'Argentina', 'Italy', 'Japan', 'USA', 'Canada', 'Georgia',
    'Romania', 'Fiji', 'Samoa', 'Tonga', 'Uruguay'];
  const COMPETITIONS = ['Six Nations', 'Rugby World Cup', 'URC', 'Premiership', 'Top 14',
    'Super Rugby', 'Pro14', 'Champions Cup', 'Challenge Cup', 'AIL'];

  const country = COUNTRIES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text)) ?? null;
  const competition = COMPETITIONS.find(c => new RegExp(c, 'i').test(text)) ?? null;

  return { country, competition };
}

// Truncate to a safe length for DB storage (keep first N chars of content)
export function truncate(text, maxChars = 8000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}

// Extract top N rugby-specific keywords by frequency
const STOP_WORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for',
  'of','with','by','from','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','this',
  'that','these','those','their','they','them','our','its','as','if','when','where',
  'which','who','what','how','all','any','both','each','few','more','most','other',
  'some','such','no','not','only','same','so','than','too','very','just','into',
  'over','about','after','before','during','between','through','team','players']);

export function extractKeywords(text, n = 12) {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq = {};
  words.forEach(w => {
    if (!STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

// Heuristic summary: first 3 sentences that contain rugby-relevant terms
const RUGBY_TERMS = /rugby|coach|player|team|tackle|scrum|lineout|ruck|maul|kick|attack|defence|defense|training|drill|law|skill|match|game|season|position|forward|back/i;

export function heuristicSummary(text, maxSentences = 3) {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 500);

  const rugbySentences = sentences.filter(s => RUGBY_TERMS.test(s));
  const selected = rugbySentences.slice(0, maxSentences);
  if (selected.length < maxSentences) {
    sentences.filter(s => !selected.includes(s)).slice(0, maxSentences - selected.length).forEach(s => selected.push(s));
  }
  return selected.join(' ').slice(0, 600);
}

// Find the most actionable sentence (contains coaching-action language)
const ACTION_SIGNALS = /\b(coach|should|must|ensure|encourage|teach|develop|focus|train|practice|improve|build|strengthen|emphasise|avoid|prevent|priorit)/i;

export function heuristicTakeaway(text) {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 20 && s.length < 300 && ACTION_SIGNALS.test(s));

  return sentences[0]?.trim().slice(0, 250) || 'Review content and extract a coaching takeaway.';
}
