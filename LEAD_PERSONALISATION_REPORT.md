# Lead Personalisation Report

Generated: 9 Jun 2026, 10:42

> ⚠️  **DEMO MODE** — using synthetic leads. Import real clubs via `npm run market:import`.

## Summary

| Metric | Value |
|---|---|
| Leads personalised | 10 |
| Pipeline expected ARR | €1,344 |
| Countries covered | 8 |
| Mode | template |

## Leads Processed

| # | Club | Country | Fit Score | Expected ARR | Contact | Mode |
|---|---|---|---|---|---|---|
| 1 | Kildare Valley RFC | Ireland | 9.2 | €252 | ✉️ email | template |
| 2 | Yorkshire Eagles RFC | England | 8.8 | €168 | ✉️ email | template |
| 3 | Stade Bordelais XV | France | 8.6 | €168 | 🌐 website | template |
| 4 | Waikato Country RFC | New Zealand | 8.3 | €168 | ✉️ email | template |
| 5 | Highland Storm RFC | Scotland | 8.1 | €168 | ✉️ email | template |
| 6 | Rhondda Valley RFC | Wales | 7.9 | €84 | 🌐 website | template |
| 7 | Cape Peninsula Rugby Club | South Africa | 7.8 | €84 | ✉️ email | template |
| 8 | Suffolk Falcons RFC | England | 7.8 | €84 | ✉️ email | template |
| 9 | Wicklow Wanderers RFC | Ireland | 7.6 | €84 | 🌐 website | template |
| 10 | Osos Rugby Madrid | Spain | 7.5 | €84 | ✉️ email | template |

## By Country

| Country | Leads |
|---|---|
| Ireland | 2 |
| England | 2 |
| France | 1 |
| New Zealand | 1 |
| Scotland | 1 |
| Wales | 1 |
| South Africa | 1 |
| Spain | 1 |

## How to Use This Data

1. **Review** — Read TOP_10_CLUB_PREVIEWS.md for coaching context on each club
2. **Approve** — Review PERSONALISED_OUTREACH_DRAFTS.md and personalise the drafts
3. **Send manually** — Copy approved drafts into your email client. Nothing is sent automatically.
4. **Track** — Update lead status in `qa/market-data/leads.json` after outreach

## Pipeline Connection

```
Market Intelligence leads.json  →  select-leads.js (fit score filter)
                                         ↓
Rugby Intelligence knowledge.jsonl  →  coaching-preview.js (KB context)
                                         ↓
Claude Haiku / templates  →  outreach-draft.js (draft generation)
                                         ↓
         3 Markdown reports  →  Human review  →  Manual outreach
```

## Revenue Model

| Fit Score | Conversion Rate | Expected ARR per Club |
|---|---|---|
| ≥ 9.0 | 30% | €252 |
| ≥ 8.0 | 20% | €168 |
| ≥ 7.5 | 10% | €84 |

Price: €70/month × 12 = €840/year per converting club
