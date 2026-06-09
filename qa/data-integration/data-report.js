/**
 * Data Report Builder
 *
 * Generates the DATA_INTEGRATION_REPORT.md and data inventory tables.
 */

import { getAllDataSources, registryStats } from './data-registry.js';
import { getPermissionMatrix }              from './data-permissions.js';
import { ADAPTER_STATUS }                   from './data-source.js';

export function buildDataInventory() {
  const sources = getAllDataSources();
  const rows = sources.map(s => {
    const statusIcon =
      s.adapterStatus === ADAPTER_STATUS.LIVE    ? '🟢 Live' :
      s.adapterStatus === ADAPTER_STATUS.MOCK    ? '🟡 Mock' :
      s.adapterStatus === ADAPTER_STATUS.STUB    ? '🔴 Stub' :
      '⚪ Planned';

    return `| **${s.name}** | ${s.type} | ${statusIcon} | ${s.sensitivity} | ${s.requiredRole}+ | ${s.description.slice(0, 60)} |`;
  });
  return rows;
}

export function buildPermissionTable() {
  const sources = getAllDataSources();
  const matrix  = getPermissionMatrix(sources);

  const rows = matrix.matrix.map(r =>
    `| **${r.role}** | ${r.sourceCount}/${matrix.sources.length} | ${r.accessibleSources.slice(0, 4).join(', ')}${r.accessibleSources.length > 4 ? ` +${r.accessibleSources.length - 4} more` : ''} |`
  );
  return rows;
}

export function buildFullReport(healthResult, queryResults, now = new Date().toISOString().split('T')[0]) {
  const stats   = registryStats();
  const sources = getAllDataSources();

  const liveIntegrations = [
    { name: 'Stripe', type: 'payment', note: 'Membership fees, online payments' },
    { name: 'SumUp', type: 'payment', note: 'Bar/café card payments, event ticket sales' },
    { name: 'Square', type: 'payment', note: 'Merchandise and bar POS' },
    { name: 'Zettle by PayPal', type: 'payment', note: 'Match-day sales, physio payments' },
    { name: 'Revolut Business', type: 'banking', note: 'Club bank account, team expenses' },
    { name: 'Google Sheets', type: 'manual', note: 'Volunteer rosters, training plans, ad hoc club data' },
    { name: 'CSV uploads', type: 'file', note: 'One-off imports from any system (squad lists, fixtures)' },
    { name: 'Club website', type: 'web', note: 'Fixture results, news, member portal registrations' },
    { name: 'Newsletter system', type: 'communication', note: 'Mailchimp/Klaviyo — open rates, click-throughs' },
    { name: 'Bar POS system', type: 'pos', note: 'Bar sales, inventory, top-selling products' },
  ];

  const inventory = buildDataInventory();
  const permTable = buildPermissionTable();

  return `# Coach's Eye Data Integration Layer — Architecture & Report

*Generated: ${now}*

---

## Mission

The Data Integration Layer teaches the AI where real club data lives and how to safely read it.

Every AI engine (Copilot, Orchestrator, Club Intelligence, Workflow Engine, Memory Engine,
Coaching Engine, Player Development) can ask:

- **What data exists?**
- **What data is missing?**
- **Who is allowed to access it?**
- **Is this answer based on real data or sample data?**

---

## Architecture

\`\`\`
qa/data-integration/
├── index.js               ← Public API (registerDataSource, queryClubData, ...)
├── data-registry.js       ← Central registry of all data sources
├── data-source.js         ← DataSource descriptor shape + factory
├── data-permissions.js    ← Role-based access control (RBAC)
├── data-normalizer.js     ← Canonical field mapping from any source format
├── data-query.js          ← Query engine: filter, sort, paginate, project
├── data-cache.js          ← In-memory TTL cache (mock: 60s, live: 30s)
├── data-health.js         ← Health checks for all registered sources
├── data-report.js         ← This file — report generation
├── adapters/
│   ├── index.js           ← Bootstrap — imports all adapters (self-register)
│   ├── players-adapter.js
│   ├── teams-adapter.js
│   ├── coaches-adapter.js
│   ├── attendance-adapter.js
│   ├── availability-adapter.js
│   ├── fixtures-adapter.js
│   ├── sessions-adapter.js
│   ├── messages-adapter.js
│   ├── injuries-adapter.js
│   ├── programmes-adapter.js
│   ├── membership-adapter.js
│   ├── finance-adapter.js
│   ├── sponsors-adapter.js
│   ├── volunteers-adapter.js
│   ├── bar-sales-adapter.js
│   ├── merchandise-adapter.js
│   ├── events-adapter.js
│   └── media-adapter.js
└── sample-data/
    ├── players.json
    ├── teams.json
    ├── coaches.json
    ├── attendance.json
    ├── availability.json
    ├── fixtures.json
    ├── sessions.json
    ├── injuries.json
    ├── memberships.json
    ├── sponsors.json
    ├── volunteers.json
    ├── bar-sales.json
    ├── merchandise.json
    └── events.json
\`\`\`

### Data Flow

\`\`\`
AI Engine request
      │
      ▼
  data-query.js
  queryClubData({ source, role, filter, fields })
      │
      ├─→ data-registry.js     (resolve source descriptor)
      ├─→ data-permissions.js  (check role access, strip sensitive fields)
      ├─→ data-cache.js        (TTL cache lookup/store)
      └─→ adapter.fetch()      (read from sample data or real connection)
              │
              └─→ data-normalizer.js  (canonical field mapping)
                          │
                          └─→ QueryResult { data, isMock, dataQuality, warnings }
\`\`\`

---

## Data Source Registry (${stats.totalSources} sources)

| Source | Type | Status | Sensitivity | Min Role | Description |
|--------|------|--------|-------------|----------|-------------|
${inventory.join('\n')}

---

## Permission Model

| Role | Accessible Sources | Examples |
|------|--------------------|---------|
${permTable.join('\n')}

### Sensitivity Levels

| Level | Min Role | Examples |
|-------|----------|---------|
| **public** | Anyone | Club name, fixtures, team names |
| **internal** | Player | Attendance rates, session notes, schedule |
| **restricted** | Coach | Contact details, development scores, availability |
| **confidential** | Manager | Medical records, finances, membership fees |

### Auto-redacted Fields

Fields matching these patterns are automatically stripped at the permissions layer:

- **Confidential:** `dob`, `medicalNotes`, `diagnosis`, `bankAccount`, `iban`, `paymentMethod`, `ppsNumber`
- **Restricted:** `phone`, `email`, `address`, `parentContact`

---

## Mock Sample Datasets

All datasets are generated for **Kildare Valley RFC** (fictional sample club):

${sources.filter(s => s.sampleDataPath).map(s =>
  `- **${s.name}** — ${s.adapterStatus === 'mock' ? '✓' : '○'} \`${s.sampleDataPath?.split('/').pop()}\``
).join('\n')}

---

## Orchestrator Integration

The Data Integration Layer exposes an Orchestrator adapter (\`orchestrator/adapters/data-integration.js\`).

When the Orchestrator processes a request, the data integration adapter runs **before** the memory engine
and pre-populates the context bus with:

| Context Bus Key | Contents |
|-----------------|---------|
| \`availableDataSources\` | All sources accessible to the request role |
| \`missingDataSources\` | Sources with no real data (stub/planned) |
| \`dataQualityWarnings\` | List of "this is sample data" warnings |
| \`dataIntegrationMeta\` | Registry stats, health summary |

Other engines check \`ctx.availableDataSources\` before deciding what to request.

---

## Club Intelligence Integration

The Club Intelligence Engine can now cite its data sources in every recommendation:

\`\`\`
"Club health score: 72/100 (based on: players ⚠ sample, attendance ⚠ sample,
 injuries ⚠ sample — connect real data sources to improve accuracy)"
\`\`\`

When real data is connected:

\`\`\`
"Club health score: 72/100 (based on: players ✓ live, attendance ✓ live,
 injuries ✓ live, bar-sales ✓ Stripe, membership ✓ live)"
\`\`\`

---

## Health Check Results (${now})

| Source | Status | Records | Mock? |
|--------|--------|---------|-------|
${(healthResult?.sources ?? []).map(s =>
  `| ${s.name} | ${s.status} | ${s.recordCount ?? '—'} | ${s.isMock ? 'Yes' : 'No'} |`
).join('\n')}

**Overall:** ${healthResult?.summary ?? 'n/a'}

---

## Future Real Integrations

${liveIntegrations.map(i =>
  `### ${i.name} (\`${i.type}\`)\n\n**Purpose:** ${i.note}\n\n**Connection pattern:**\n\`\`\`js\n// qa/data-integration/adapters/${i.name.toLowerCase().replace(/\s+/g, '-')}-live-adapter.js\nregisterDataSource({\n  name: '${i.name.toLowerCase().replace(/\s+/g, '-')}',\n  adapterStatus: 'live',\n  realConnection: { type: '${i.type}', provider: '${i.name}' },\n  fetch: async (params) => {\n    // Connect to ${i.name} API\n    const data = await ${i.name.replace(/\s+/g, '')}Client.fetch(params);\n    return fetchResult(data, '${i.name.toLowerCase()}', false);\n  }\n});\n\`\`\`\n`
).join('\n')}

---

## Usage Examples

\`\`\`js
import { queryClubData, getAvailableData, getDataHealth } from './qa/data-integration/index.js';

// What data is available to a coach?
const available = getAvailableData('coach');
console.log(available.sources.map(s => s.name));

// Query all active U16 players
const players = await queryClubData({
  source: 'players',
  role:   'coach',
  filter: { ageGroup: 'U16', active: true },
  fields: ['name', 'position', 'attendanceRate'],
});
// ⚠ Returns with isMock: true until real data connected

// Health check
const health = await getDataHealth();
console.log(health.summary);  // "0 live, 13 mock, 3 unavailable, 2 planned"
\`\`\`

---

*Report generated by Coach's Eye Data Integration Layer*
`;
}
