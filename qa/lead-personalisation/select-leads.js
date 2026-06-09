/**
 * Lead Selection — filters the market intelligence lead database for high-fit clubs.
 *
 * Selection criteria:
 *   fitScore >= threshold (default 7.5)
 *   has email OR website
 *   status in ['new', 'reviewed']
 *
 * When the database is empty (dev / no CSV imported yet), --demo mode
 * returns 10 fictional but realistic rugby clubs across key markets.
 */

import { loadLeads } from '../market-intel/lead-db.js';

export const DEFAULT_THRESHOLD  = 7.5;
export const DEFAULT_LIMIT      = 10;
export const CONTACTABLE_STATUSES = ['new', 'reviewed'];

// ── Revenue model (from Market Intelligence Agent) ─────────────────────────────
const MONTHLY_PRICE = 70; // €70/month
const ANNUAL_PRICE  = MONTHLY_PRICE * 12; // €840/year

export function expectedARR(fitScore) {
  if (fitScore >= 9)   return Math.round(ANNUAL_PRICE * 0.30);
  if (fitScore >= 8)   return Math.round(ANNUAL_PRICE * 0.20);
  if (fitScore >= 7.5) return Math.round(ANNUAL_PRICE * 0.10);
  return 0;
}

// ── Demo leads — fictional clubs, clearly labelled ───────────────────────────
export const DEMO_LEADS = [
  {
    id: 'demo_01', clubName: 'Kildare Valley RFC', country: 'Ireland',
    website: 'https://kildarevalleyrfc.ie', email: 'secretary@kildarevalleyrfc.ie',
    level: 'adult_amateur', estimatedPlayers: 280, fitScore: 9.2,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_02', clubName: 'Yorkshire Eagles RFC', country: 'England',
    website: 'https://yorkshireeaglesrfc.co.uk', email: 'admin@yorkshireeaglesrfc.co.uk',
    level: 'adult_amateur', estimatedPlayers: 185, fitScore: 8.8,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_03', clubName: 'Stade Bordelais XV', country: 'France',
    website: 'https://stadebordelaisxv.fr', email: null,
    level: 'adult_amateur', estimatedPlayers: 340, fitScore: 8.6,
    status: 'reviewed', source: 'demo', notes: '', socialFacebook: 'fb.com/stadebordelaisxv', socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_04', clubName: 'Waikato Country RFC', country: 'New Zealand',
    website: 'https://waikatocountryrugby.nz', email: 'club@waikatocountryrugby.nz',
    level: 'adult_amateur', estimatedPlayers: 125, fitScore: 8.3,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_05', clubName: 'Highland Storm RFC', country: 'Scotland',
    website: 'https://highlandstormrfc.scot', email: 'info@highlandstormrfc.scot',
    level: 'adult_amateur', estimatedPlayers: 195, fitScore: 8.1,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_06', clubName: 'Rhondda Valley RFC', country: 'Wales',
    website: 'https://rhonddavalleyrfc.wales', email: null,
    level: 'adult_amateur', estimatedPlayers: 160, fitScore: 7.9,
    status: 'new', source: 'demo', notes: '', socialFacebook: 'fb.com/rhonddavalleyrfc', socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_07', clubName: 'Cape Peninsula Rugby Club', country: 'South Africa',
    website: 'https://capepeninsularugby.co.za', email: 'admin@capepeninsularugby.co.za',
    level: 'adult_amateur', estimatedPlayers: 210, fitScore: 7.8,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_08', clubName: 'Suffolk Falcons RFC', country: 'England',
    website: 'https://suffolkfalkonsrfc.co.uk', email: 'secretary@suffolkfalconsrfc.co.uk',
    level: 'adult_amateur', estimatedPlayers: 140, fitScore: 7.8,
    status: 'reviewed', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_09', clubName: 'Wicklow Wanderers RFC', country: 'Ireland',
    website: 'https://wicklowwanderers.ie', email: null,
    level: 'adult_amateur', estimatedPlayers: 310, fitScore: 7.6,
    status: 'new', source: 'demo', notes: '', socialFacebook: 'fb.com/wicklowwanderersrfc', socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo_10', clubName: 'Osos Rugby Madrid', country: 'Spain',
    website: 'https://ososrugby.es', email: 'contacto@ososrugby.es',
    level: 'adult_amateur', estimatedPlayers: 90, fitScore: 7.5,
    status: 'new', source: 'demo', notes: '', socialFacebook: null, socialInstagram: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
];

/**
 * Select high-fit leads from the database.
 *
 * @param {{ threshold?, limit?, demo? }} opts
 * @returns {{ leads, isDemo, totalInDb, filtered }}
 */
export function selectLeads({ threshold = DEFAULT_THRESHOLD, limit = DEFAULT_LIMIT, demo = false } = {}) {
  const allLeads = loadLeads();
  const isDemo   = demo || allLeads.length === 0;
  const pool     = isDemo ? DEMO_LEADS : allLeads;

  const filtered = pool.filter(l =>
    (l.fitScore ?? 0) >= threshold &&
    (l.email || l.website) &&
    CONTACTABLE_STATUSES.includes(l.status)
  );

  const selected = filtered
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
    .slice(0, limit);

  return {
    leads: selected,
    isDemo,
    totalInDb: allLeads.length,
    filtered: filtered.length,
  };
}
