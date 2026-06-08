import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const DATA_DIR = join(ROOT, 'qa/market-data');
const LEADS_FILE = join(DATA_DIR, 'leads.json');
const COMPETITORS_FILE = join(DATA_DIR, 'competitors.json');

function ensureDir(dir) { mkdirSync(dir, { recursive: true }); }

function loadFile(path, defaultValue) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return defaultValue; }
}

function saveFile(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

export function loadLeads() { return loadFile(LEADS_FILE, []); }
export function saveLeads(leads) { saveFile(LEADS_FILE, leads); }
export function loadCompetitors() { return loadFile(COMPETITORS_FILE, []); }
export function saveCompetitors(competitors) { saveFile(COMPETITORS_FILE, competitors); }

function normalise(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(lead) {
  return `${normalise(lead.clubName)}::${normalise(lead.country)}`;
}

export function upsertLead(incoming, db = null) {
  const leads = db ?? loadLeads();
  const key = dedupeKey(incoming);
  const idx = leads.findIndex(l => dedupeKey(l) === key);
  const now = new Date().toISOString();

  if (idx >= 0) {
    leads[idx] = {
      ...leads[idx],
      ...incoming,
      id: leads[idx].id,
      createdAt: leads[idx].createdAt,
      updatedAt: now,
      // preserve manual fields unless explicitly overridden
      status: incoming.status ?? leads[idx].status,
      notes: incoming.notes != null && incoming.notes !== '' ? incoming.notes : leads[idx].notes,
    };
    return { lead: leads[idx], isNew: false };
  }

  const lead = {
    id: `lead_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
    clubName: incoming.clubName || 'Unknown',
    country: incoming.country || 'Unknown',
    website: incoming.website || null,
    email: incoming.email || null,
    phone: incoming.phone || null,
    socialFacebook: incoming.socialFacebook || null,
    socialInstagram: incoming.socialInstagram || null,
    level: incoming.level || 'unknown',
    estimatedPlayers: incoming.estimatedPlayers || null,
    fitScore: incoming.fitScore ?? null,
    status: 'new',
    notes: incoming.notes || '',
    lastReviewed: null,
    source: incoming.source || 'manual',
    createdAt: now,
    updatedAt: now,
  };
  leads.push(lead);
  return { lead, isNew: true };
}

export function updateLeadScore(id, fitScore) {
  const leads = loadLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) return false;
  lead.fitScore = fitScore;
  lead.lastReviewed = new Date().toISOString();
  lead.updatedAt = lead.lastReviewed;
  saveLeads(leads);
  return true;
}

export function updateLeadStatus(id, status, notes = null) {
  const leads = loadLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) return false;
  lead.status = status;
  if (notes !== null) lead.notes = notes;
  lead.updatedAt = new Date().toISOString();
  saveLeads(leads);
  return true;
}

export function getLead(id) {
  return loadLeads().find(l => l.id === id) ?? null;
}

export function listLeads({ status, minScore, country } = {}) {
  let leads = loadLeads();
  if (status) leads = leads.filter(l => l.status === status);
  if (minScore != null) leads = leads.filter(l => (l.fitScore ?? 0) >= minScore);
  if (country) leads = leads.filter(l => normalise(l.country) === normalise(country));
  return leads.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
}
