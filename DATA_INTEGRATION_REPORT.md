# Coach's Eye Data Integration Layer — Architecture & Report

*Generated: Tue Jun 09 2026 13:16:57 GMT+0200 (Central European Summer Time)*

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

```
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
```

### Data Flow

```
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
```

---

## Data Source Registry (18 sources)

| Source | Type | Status | Sensitivity | Min Role | Description |
|--------|------|--------|-------------|----------|-------------|
| **players** | player | 🟡 Mock | restricted | coach+ | All registered playing members — name, position, age group,  |
| **teams** | team | 🟡 Mock | internal | player+ | Club teams — age groups, coaches, player counts, performance |
| **coaches** | coaching | 🟡 Mock | restricted | manager+ | Coaching staff — roles, qualifications, age groups, contact  |
| **attendance** | attendance | 🟡 Mock | internal | coach+ | Session attendance records — who attended, who was absent, r |
| **availability** | operational | 🟡 Mock | restricted | coach+ | Player availability for upcoming fixtures — available, unava |
| **fixtures** | operational | 🟡 Mock | public | public+ | Season fixtures — dates, opponents, venues, results for all  |
| **sessions** | coaching | 🟡 Mock | internal | coach+ | Training session records — dates, focus, attendance, coach n |
| **injuries** | player | 🟡 Mock | confidential | manager+ | Injury records — type, severity, status, expected return dat |
| **membership** | financial | 🟡 Mock | confidential | manager+ | Membership registrations — types, status, amounts paid, outs |
| **sponsors** | commercial | 🟡 Mock | confidential | manager+ | Club sponsors — tiers, contributions, renewal dates, benefit |
| **volunteers** | operational | 🟡 Mock | internal | manager+ | Volunteer database — roles, hours contributed, active status |
| **bar-sales** | financial | 🟡 Mock | confidential | manager+ | Bar/café revenue — monthly totals, match-day vs regular sale |
| **merchandise** | commercial | 🟡 Mock | confidential | manager+ | Kit and merchandise inventory — stock levels, sales, revenue |
| **events** | operational | 🟡 Mock | public | public+ | Club events calendar — social, fundraising, coaching, compet |
| **programmes** | coaching | 🟡 Mock | restricted | coach+ | Player training programmes — status, phase, AI-generated pla |
| **finance** | financial | ⚪ Planned | confidential | admin+ | General club financial ledger — income, expenditure, bank ba |
| **messages** | communication | 🔴 Stub | confidential | manager+ | Coach-player message history from the app chat system |
| **media** | media | ⚪ Planned | public | public+ | Match photos, videos, and highlights — planned integration |

---

## Permission Model

| Role | Accessible Sources | Examples |
|------|--------------------|---------|
| **public** | 3/18 | fixtures, events, media |
| **player** | 4/18 | teams, fixtures, events, media |
| **coach** | 9/18 | players, teams, attendance, availability +5 more |
| **manager** | 17/18 | players, teams, coaches, attendance +13 more |
| **admin** | 18/18 | players, teams, coaches, attendance +14 more |
| **dor** | 18/18 | players, teams, coaches, attendance +14 more |

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

- **players** — ✓ `players.json`
- **teams** — ✓ `teams.json`
- **coaches** — ✓ `coaches.json`
- **attendance** — ✓ `attendance.json`
- **availability** — ✓ `availability.json`
- **fixtures** — ✓ `fixtures.json`
- **sessions** — ✓ `sessions.json`
- **injuries** — ✓ `injuries.json`
- **membership** — ✓ `memberships.json`
- **sponsors** — ✓ `sponsors.json`
- **volunteers** — ✓ `volunteers.json`
- **bar-sales** — ✓ `bar-sales.json`
- **merchandise** — ✓ `merchandise.json`
- **events** — ✓ `events.json`

---

## Orchestrator Integration

The Data Integration Layer exposes an Orchestrator adapter (`orchestrator/adapters/data-integration.js`).

When the Orchestrator processes a request, the data integration adapter runs **before** the memory engine
and pre-populates the context bus with:

| Context Bus Key | Contents |
|-----------------|---------|
| `availableDataSources` | All sources accessible to the request role |
| `missingDataSources` | Sources with no real data (stub/planned) |
| `dataQualityWarnings` | List of "this is sample data" warnings |
| `dataIntegrationMeta` | Registry stats, health summary |

Other engines check `ctx.availableDataSources` before deciding what to request.

---

## Club Intelligence Integration

The Club Intelligence Engine can now cite its data sources in every recommendation:

```
"Club health score: 72/100 (based on: players ⚠ sample, attendance ⚠ sample,
 injuries ⚠ sample — connect real data sources to improve accuracy)"
```

When real data is connected:

```
"Club health score: 72/100 (based on: players ✓ live, attendance ✓ live,
 injuries ✓ live, bar-sales ✓ Stripe, membership ✓ live)"
```

---

## Health Check Results (Tue Jun 09 2026 13:16:57 GMT+0200 (Central European Summer Time))

| Source | Status | Records | Mock? |
|--------|--------|---------|-------|
| players | mock | 20 | Yes |
| teams | mock | 5 | Yes |
| coaches | mock | 3 | Yes |
| attendance | mock | 10 | Yes |
| availability | mock | 3 | Yes |
| fixtures | mock | 7 | Yes |
| sessions | mock | 10 | Yes |
| injuries | mock | 4 | Yes |
| membership | mock | 15 | Yes |
| sponsors | mock | 3 | Yes |
| volunteers | mock | 8 | Yes |
| bar-sales | mock | 4 | Yes |
| merchandise | mock | 5 | Yes |
| events | mock | 5 | Yes |
| programmes | mock | 2 | Yes |
| finance | planned | 0 | Yes |
| messages | unavailable | 0 | Yes |
| media | planned | 0 | Yes |

**Overall:** 0 live, 15 mock, 1 unavailable, 2 planned

---

## Future Real Integrations

### Stripe (`payment`)

**Purpose:** Membership fees, online payments

**Connection pattern:**
```js
// qa/data-integration/adapters/stripe-live-adapter.js
registerDataSource({
  name: 'stripe',
  adapterStatus: 'live',
  realConnection: { type: 'payment', provider: 'Stripe' },
  fetch: async (params) => {
    // Connect to Stripe API
    const data = await StripeClient.fetch(params);
    return fetchResult(data, 'stripe', false);
  }
});
```

### SumUp (`payment`)

**Purpose:** Bar/café card payments, event ticket sales

**Connection pattern:**
```js
// qa/data-integration/adapters/sumup-live-adapter.js
registerDataSource({
  name: 'sumup',
  adapterStatus: 'live',
  realConnection: { type: 'payment', provider: 'SumUp' },
  fetch: async (params) => {
    // Connect to SumUp API
    const data = await SumUpClient.fetch(params);
    return fetchResult(data, 'sumup', false);
  }
});
```

### Square (`payment`)

**Purpose:** Merchandise and bar POS

**Connection pattern:**
```js
// qa/data-integration/adapters/square-live-adapter.js
registerDataSource({
  name: 'square',
  adapterStatus: 'live',
  realConnection: { type: 'payment', provider: 'Square' },
  fetch: async (params) => {
    // Connect to Square API
    const data = await SquareClient.fetch(params);
    return fetchResult(data, 'square', false);
  }
});
```

### Zettle by PayPal (`payment`)

**Purpose:** Match-day sales, physio payments

**Connection pattern:**
```js
// qa/data-integration/adapters/zettle-by-paypal-live-adapter.js
registerDataSource({
  name: 'zettle-by-paypal',
  adapterStatus: 'live',
  realConnection: { type: 'payment', provider: 'Zettle by PayPal' },
  fetch: async (params) => {
    // Connect to Zettle by PayPal API
    const data = await ZettlebyPayPalClient.fetch(params);
    return fetchResult(data, 'zettle by paypal', false);
  }
});
```

### Revolut Business (`banking`)

**Purpose:** Club bank account, team expenses

**Connection pattern:**
```js
// qa/data-integration/adapters/revolut-business-live-adapter.js
registerDataSource({
  name: 'revolut-business',
  adapterStatus: 'live',
  realConnection: { type: 'banking', provider: 'Revolut Business' },
  fetch: async (params) => {
    // Connect to Revolut Business API
    const data = await RevolutBusinessClient.fetch(params);
    return fetchResult(data, 'revolut business', false);
  }
});
```

### Google Sheets (`manual`)

**Purpose:** Volunteer rosters, training plans, ad hoc club data

**Connection pattern:**
```js
// qa/data-integration/adapters/google-sheets-live-adapter.js
registerDataSource({
  name: 'google-sheets',
  adapterStatus: 'live',
  realConnection: { type: 'manual', provider: 'Google Sheets' },
  fetch: async (params) => {
    // Connect to Google Sheets API
    const data = await GoogleSheetsClient.fetch(params);
    return fetchResult(data, 'google sheets', false);
  }
});
```

### CSV uploads (`file`)

**Purpose:** One-off imports from any system (squad lists, fixtures)

**Connection pattern:**
```js
// qa/data-integration/adapters/csv-uploads-live-adapter.js
registerDataSource({
  name: 'csv-uploads',
  adapterStatus: 'live',
  realConnection: { type: 'file', provider: 'CSV uploads' },
  fetch: async (params) => {
    // Connect to CSV uploads API
    const data = await CSVuploadsClient.fetch(params);
    return fetchResult(data, 'csv uploads', false);
  }
});
```

### Club website (`web`)

**Purpose:** Fixture results, news, member portal registrations

**Connection pattern:**
```js
// qa/data-integration/adapters/club-website-live-adapter.js
registerDataSource({
  name: 'club-website',
  adapterStatus: 'live',
  realConnection: { type: 'web', provider: 'Club website' },
  fetch: async (params) => {
    // Connect to Club website API
    const data = await ClubwebsiteClient.fetch(params);
    return fetchResult(data, 'club website', false);
  }
});
```

### Newsletter system (`communication`)

**Purpose:** Mailchimp/Klaviyo — open rates, click-throughs

**Connection pattern:**
```js
// qa/data-integration/adapters/newsletter-system-live-adapter.js
registerDataSource({
  name: 'newsletter-system',
  adapterStatus: 'live',
  realConnection: { type: 'communication', provider: 'Newsletter system' },
  fetch: async (params) => {
    // Connect to Newsletter system API
    const data = await NewslettersystemClient.fetch(params);
    return fetchResult(data, 'newsletter system', false);
  }
});
```

### Bar POS system (`pos`)

**Purpose:** Bar sales, inventory, top-selling products

**Connection pattern:**
```js
// qa/data-integration/adapters/bar-pos-system-live-adapter.js
registerDataSource({
  name: 'bar-pos-system',
  adapterStatus: 'live',
  realConnection: { type: 'pos', provider: 'Bar POS system' },
  fetch: async (params) => {
    // Connect to Bar POS system API
    const data = await BarPOSsystemClient.fetch(params);
    return fetchResult(data, 'bar pos system', false);
  }
});
```


---

## Usage Examples

```js
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
```

---

*Report generated by Coach's Eye Data Integration Layer*
