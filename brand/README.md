# CoachEasier Brand System

Corporate identity assets for **CoachEasier** — website, marketing, emails,
splash screens, favicon, PWA icons, App Store and corporate use.

> **Scope note:** this system is the *company* brand. The product application is
> multi-tenant — each rugby club's own colours drive the in-app interface. These
> assets replace only the generic product branding (login, icons, splash,
> marketing surfaces); they must never override a club's colour scheme.

## The mark

A silver "C" ring with a champagne-gold lower arc, carrying a forward-leaning
"E". All geometry is **parametric vector** — regenerate every SVG with:

```
node brand/build-logo.mjs      # emits brand/svg/*
node brand/render.mjs <in.svg> <out.png> <size|WxH> [bg]   # PNG export (Chromium)
```

## Palette

| Role | Colour |
|---|---|
| Silver (bright, on dark) | `#FDFDFE → #82888F` gradient family |
| Silver (deep, on light)  | `#E7E9EC → #585F67` gradient family |
| Champagne gold (on dark) | `#F7EBC8 → #8C6A2E` gradient family |
| Champagne gold (on light)| `#E9D9AE → #7A5D26` gradient family |
| Ink / tile background    | `#0A0D12` |
| Mono mark (dark)         | `#12161C` |
| Flat favicon silver/gold | `#C7CCD2` / `#C79A47` |

Gold is **champagne/brushed** — never bright yellow.

## Files

### Vector masters — `brand/svg/`
| File | Use |
|---|---|
| `coacheasier-mark.svg` | Icon-only metallic mark, transparent — dark backgrounds |
| `coacheasier-mark-on-light.svg` | Metal stops deepened for white/light backgrounds |
| `coacheasier-mark-mono-dark.svg` | One-colour dark mark — print, engraving, light bg |
| `coacheasier-mark-mono-white.svg` | One-colour white mark — dark bg, watermarks |
| `coacheasier-logo-horizontal(-on-light).svg` | Mark + COACHEASIER + tagline, landscape |
| `coacheasier-logo-master(-on-light).svg` | Stacked master lockup |
| `coacheasier-favicon.svg` | Flat-colour simplified mark — crisp at 16–48 px |
| `coacheasier-appicon.svg` | Dark rounded-square app tile (mark at 72 %) |
| `coacheasier-appicon-maskable.svg` | Full-bleed square, mark inside the 58 % safe zone |

### Raster exports — `brand/png/`
Transparent masters: `coacheasier-mark-1024` / `-on-light-1024` /
`-mono-dark-1024` / `-mono-white-1024`, `coacheasier-logo-horizontal-2600w`
(+ `-on-light`), `coacheasier-logo-master-1600` (+ `-on-light`).
Icons: `coacheasier-appicon-1024/512/192`, `coacheasier-appicon-maskable-512`,
`coacheasier-apple-touch-180` (opaque, iOS requirement),
`favicon-16/32/48.png`, `coacheasier-favicon.ico` (16+32+48 bundle).

## Usage rules

1. The product name is **CoachEasier** — never "CE Sports".
2. Tagline: **IT'S IN OUR GAME.** — "OUR" in champagne gold. Use only in lockups.
3. Compact contexts may use the CE mark alone; keep the text name "CoachEasier"
   nearby wherever the mark alone would be ambiguous.
4. Use the `-on-light` variants on white/light surfaces — don't put the bright
   dark-bg metals on white.
5. Monochrome versions for single-colour print, embossing, and watermarks.
6. Never stretch, recolour, outline, or add effects to the mark.
7. Emails: prefer the horizontal PNG on a plain background; keep total header
   image weight small for deliverability.

## Known limitation — wordmark font

Lockup text renders through the system stack (`Helvetica Neue → Helvetica →
Arial`, bold italic). PNG exports are pixel-faithful. Before wide **external
print/agency** distribution, choose and license a final brand typeface and
outline the lockup text to paths; the mark itself is already pure geometry.
