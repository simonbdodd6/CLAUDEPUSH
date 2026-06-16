import test from 'node:test';
import assert from 'node:assert/strict';
import { getDesignTokens, buildExperienceTokens, listExperienceIdentities, cardTreatment, PALETTE, MOODS, TOKENS_VERSION } from '../design-tokens.js';
import { SECTION_LAYOUTS, CARD_KINDS, EMPHASIS, EXPERIENCES } from '../experience-presentation.js';

test('getDesignTokens returns a complete, versioned token system', () => {
  const t = getDesignTokens();
  assert.equal(t.version, TOKENS_VERSION);
  for (const k of ['palette', 'typography', 'spacing', 'radii', 'elevation', 'layouts', 'cards', 'hero', 'timeline', 'statistic', 'media', 'map', 'achievement', 'emptyState', 'moods', 'enums']) {
    assert.ok(t[k], `missing token group ${k}`);
  }
});

test('layout guidance covers every SECTION_LAYOUT', () => {
  const t = getDesignTokens();
  for (const l of SECTION_LAYOUTS) {
    assert.ok(t.layouts[l], `missing layout ${l}`);
    assert.ok(['vertical', 'horizontal', 'paged'].includes(t.layouts[l].scroll));
    assert.ok(typeof t.layouts[l].columns === 'number');
  }
});

test('card base treatment covers every CARD_KIND', () => {
  const t = getDesignTokens();
  for (const k of CARD_KINDS) assert.ok(t.cards.byKind[k], `missing card kind ${k}`);
});

test('cardTreatment resolves deterministically for every kind × emphasis', () => {
  for (const k of CARD_KINDS) {
    for (const e of EMPHASIS) {
      const a = cardTreatment(k, e);
      const b = cardTreatment(k, e);
      assert.deepEqual(a, b);
      assert.equal(a.kind, k);
      assert.equal(a.emphasis, e);
      assert.ok(a.surface && a.density && a.radius && a.elevation && typeof a.scale === 'number');
    }
  }
  // hero emphasis is the most prominent treatment
  const heroCard = cardTreatment('scene', 'hero');
  assert.equal(heroCard.elevation, 'floating');
  assert.equal(heroCard.density, 'spacious');
  assert.equal(heroCard.mediaShape, 'fill');
});

test('achievement treatment covers all tiers and references real swatches', () => {
  const t = getDesignTokens();
  for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legend']) {
    assert.ok(t.achievement[tier], `missing tier ${tier}`);
    assert.ok(PALETTE[t.achievement[tier].swatch], `tier ${tier} swatch not in palette`);
  }
  assert.equal(t.achievement.Legend.glow, true);
});

test('buildExperienceTokens returns identity + resolved swatches for every experience', () => {
  for (const e of EXPERIENCES) {
    const x = buildExperienceTokens(e.id);
    assert.equal(x.experience, e.id);
    assert.ok(MOODS.includes(x.identity.mood), `bad mood ${x.identity.mood}`);
    assert.ok(x.identity.accentSwatch && x.identity.accentSwatch.hex);
    assert.ok(x.identity.secondarySwatch && x.identity.secondarySwatch.hex);
    assert.ok(x.identity.gradientSwatches.length === 2 && x.identity.gradientSwatches.every(s => s && s.hex));
    assert.ok(x.hero && x.timeline && x.statistic && x.media && x.map && x.emptyState && x.system);
  }
});

test('every accent referenced by an experience identity exists in the palette', () => {
  for (const e of EXPERIENCES) {
    const x = buildExperienceTokens(e.id);
    assert.ok(PALETTE[x.identity.accent], `accent ${x.identity.accent} not in palette`);
    assert.ok(PALETTE[x.identity.secondaryAccent], `secondary ${x.identity.secondaryAccent} not in palette`);
    for (const g of x.identity.gradient) assert.ok(PALETTE[g], `gradient ${g} not in palette`);
  }
});

test('listExperienceIdentities returns one identity per experience', () => {
  const list = listExperienceIdentities();
  assert.equal(list.length, EXPERIENCES.length);
  assert.ok(list.every(i => i.id && i.accent && PALETTE[i.accent] && i.accentSwatch));
});

test('unknown experience throws UNKNOWN_EXPERIENCE', () => {
  assert.throws(() => buildExperienceTokens('nope'), e => e.code === 'UNKNOWN_EXPERIENCE');
});

test('tokens are deterministic and fully serialisable', () => {
  assert.deepEqual(getDesignTokens(), getDesignTokens());
  for (const e of EXPERIENCES) assert.deepEqual(buildExperienceTokens(e.id), buildExperienceTokens(e.id));
  // round-trips through JSON without loss
  const t = getDesignTokens();
  assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
});

test('palette swatches are well-formed (token + hex + on-color)', () => {
  for (const [key, sw] of Object.entries(PALETTE)) {
    assert.equal(sw.token, key);
    assert.match(sw.hex, /^#[0-9A-F]{6}$/i);
    assert.match(sw.on, /^#[0-9A-F]{6}$/i);
    assert.ok(['accent', 'neutral'].includes(sw.role));
  }
});
