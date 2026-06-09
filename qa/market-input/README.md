# Market Intelligence Input

Drop research files here. The agent reads them and extracts structured data.

## Directory structure

```
qa/market-input/
  clubs/           ← rugby club pages (websites, Facebook pages, Google results)
  competitors/     ← competitor product pages (Pitchero, Teamer, TeamApp, etc.)
  urls.txt         ← URLs to fetch automatically (one per line)
  examples/        ← reference examples
```

## How to add a club

1. Visit the club's website or Facebook page
2. Select All → Copy → paste into a `.txt` file
3. Save it as `clubs/clubname-country.txt`

OR: save the whole page as HTML (`File → Save Page As`) into `clubs/`.

That's it. The agent handles the extraction.

## How to add a competitor

Same process — save the competitor's pricing/features page as text or HTML into `competitors/`.

Good sources:
- Pricing page
- Features page  
- "For clubs" or "How it works" page

## urls.txt format

```
# Lines starting with # are ignored
# Default type is 'club'
https://some-rugby-club.ie
https://another-club.fr

# Prefix with 'competitor:' for product pages
competitor:https://www.pitchero.com/pricing
competitor:https://www.teamer.net
```

## Running the agent

```bash
# With AI-powered extraction (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... node qa/market-intel-agent.js

# Heuristic-only mode (no API key needed, less accurate)
node qa/market-intel-agent.js

# Dry run (parses inputs, skips API calls)
node qa/market-intel-agent.js --dry-run

# Verbose output
node qa/market-intel-agent.js --verbose
```

## Output

Reports are written to `qa/market-reports/`:

- `CLUB_LEADS_REPORT.md` — all clubs ranked by fit score
- `COMPETITOR_PRICING_REPORT.md` — competitor analysis with pricing
- `MARKET_INTELLIGENCE_REPORT.md` — synthesised market view + recommended sprint
- `market-intel-summary.json` — machine-readable summary for Mission Control dashboard

## Fit score guide

| Score | Meaning |
|-------|---------|
| 9–10 | Strong lead — amateur club, clear pain, direct contact, no digital tools |
| 7–8 | Good lead — amateur club with some digital presence but obvious coaching gap |
| 5–6 | Possible — unclear level, partial digital presence |
| 3–4 | Low priority — large/semi-pro club, different budget tier |
| 1–2 | Not a fit — professional, already has solutions, or wrong sport |
