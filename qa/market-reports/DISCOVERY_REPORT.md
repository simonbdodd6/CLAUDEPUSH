# Discovery Agent Report

_Session: disc_20260609_83c0202c_
_Run at: 6/9/2026, 12:16:34 PM_
_Providers: csv, manual, rugby-directory_

---

## Session Summary

| Metric | Value |
|--------|-------|
| Clubs discovered | **8** |
| After deduplication | **8** |
| Duplicates removed | 0 (0%) |
| New leads added to DB | **0** |
| Existing leads updated | 8 |
| Ready for scoring | **8** (confidence ≥ 0.70) |
| Needs review | 0 (confidence 0.45–0.69) |
| Low confidence (skipped) | 0 |
| Errors | 0 |

---

## Clubs by Country (Top 10)

| Country | Unique Clubs | With Email |
|---------|-------------|-----------|
| Ireland | 1 | 1 |
| England | 1 | 1 |
| France | 1 | 0 |
| New Zealand | 1 | 1 |
| Scotland | 1 | 1 |
| Wales | 1 | 0 |
| South Africa | 1 | 1 |
| Spain | 1 | 1 |

---

## Sources

| Source | Records |
|--------|---------|
| csv:sample-clubs.csv | 8 |

---

## Top Ready-to-Score Clubs

These clubs have confidence ≥ 0.70 and are in the lead database awaiting fit scoring.

| Club | Country | Level | Confidence | Email |
|------|---------|-------|-----------|-------|
| **Kildare Valley RFC** | Ireland | adult_amateur | 0.90 | `secretary@kildarevalleyrfc.ie` |
| **Yorkshire Eagles RFC** | England | adult_amateur | 0.90 | `admin@yorkshireeaglesrfc.co.uk` |
| **Waikato Country RFC** | New Zealand | adult_amateur | 0.90 | `club@waikatocountryrugby.nz` |
| **Highland Storm RFC** | Scotland | adult_amateur | 0.90 | `info@highlandstormrfc.scot` |
| **Cape Peninsula Rugby Club** | South Africa | adult_amateur | 0.90 | `admin@capepeninsularugby.co.za` |
| **Osos Rugby Madrid** | Spain | adult_amateur | 0.90 | `contacto@ososrugby.es` |
| **Stade Bordelais XV** | France | adult_amateur | 0.80 | — |
| **Rhondda Valley RFC** | Wales | adult_amateur | 0.80 | — |

---

## Next Steps

1. **Score leads**: `node qa/market-intel/pipeline.js --score`
2. **Review low-confidence**: check `qa/discovery-state/sessions/disc_20260609_83c0202c.json`
3. **Add more data**: drop CSVs in `qa/market-input/csv/` or JSON in `qa/market-input/manual/`
4. **Run full pipeline**: `node qa/market-intel/pipeline.js`

---

_Discovery agent does not scrape the web. All data comes from manually provided files._
