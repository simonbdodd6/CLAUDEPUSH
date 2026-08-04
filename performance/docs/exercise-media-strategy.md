# Exercise Media Strategy (SC3)

SC3 ships **explicit placeholders only** — `media.status: 'placeholder'`,
zero assets, alt text on every record, and a validation rule that rejects
external URLs. No copyrighted external material is downloaded, embedded or
linked. The library UI renders an honest "Demonstration coming soon" panel
with no fake video controls.

## Options assessed

| Option | Quality | Cost | Ownership | Verdict |
|---|---|---|---|---|
| 1. Original CoachEasier demo videos | highest trust, on-brand | high (shoot days, athletes, editing) | full | **Production target** |
| 2. Original illustrated graphics | consistent, cheap to version | medium (illustrator system) | full | **Production companion** (thumbnails, print) |
| 3. Short looping animations (from 1) | great for form loops | low once video exists | full | Production derivative |
| 4. Still-image sequences (from 1) | good low-bandwidth fallback | low once video exists | full | Production derivative |
| 5. Licensed third-party content | fast | recurring licence risk, off-brand, unclear edit rights | licensor | **Rejected** for core library |
| 6. Beta placeholders | n/a | zero | n/a | **Beta approach (current)** |

## Recommendations

- **Beta:** keep placeholders. Never ship third-party stopgaps — a missing
  video is honest; an unlicensed one is a liability.
- **Production:** one filmed session per exercise batch producing (a) 10–20 s
  demo video, (b) 2–4 s loop, (c) 3–5 still sequence, (d) thumbnail —
  all cut from the same master so form guidance never diverges.

## Requirements for production media

- **Ownership:** CoachEasier owns all masters and derivatives; contracts
  with videographers assign rights in writing.
- **Demonstrator consent:** written, purpose-specific consent (library use,
  marketing separate opt-in), revocable, with re-shoot plan for revocation;
  no youth demonstrators without guardian consent + safeguarding review.
- **Storage/delivery:** originals in cold storage; delivery via CDN with
  size-tiered renditions; assets addressed by content hash so exercise
  versions can pin exact media versions.
- **Thumbnails:** generated from the master at publish time, stored as
  first-class assets.
- **Captions & transcripts:** every video carries captions and a text
  transcript (the coaching text is the source script — one wording).
- **Accessibility:** alt text mandatory (already in schema), captions on,
  loops respect prefers-reduced-motion, no autoplay with sound.
- **Versioning:** `media.status` lifecycle placeholder → in_production →
  review → published; media review date and reviewer recorded; re-review
  when the exercise definition changes materially.
- **Copyright/licence records:** per-asset source, owner, licence and
  review date fields (already in schema) are mandatory before `published`.

## Approval gate

No asset reaches `published` without the media/copyright review gate (see
exercise-ownership-and-approval.md) and, where people are identifiable, the
privacy review gate.
