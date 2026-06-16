/**
 * dependency-cruiser configuration — REPORT-ONLY (M31.0)
 *
 * Encodes the shared AI Brain platform dependency rules. Every rule has
 * severity 'warn' (never 'error'), so a run NEVER fails CI in this phase — it
 * only reports. Activating failing severities is a deliberate later step.
 *
 * Scope for M31.0: the new `packages/` ring rules. The existing `ai-brain/`,
 * `app/`, `api/`, `src/` trees are intentionally NOT analysed here so nothing
 * about current behaviour changes. Wider enforcement is added in later phases.
 *
 * Running it requires the binary (not installed in M31.0 to keep the tree
 * inert):  npx dependency-cruiser --config .dependency-cruiser.cjs packages
 */

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'No circular dependencies within the platform packages.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-depends-on-nothing',
      comment: '@brain/contracts is the spine; it must import nothing else.',
      severity: 'warn',
      from: { path: '^packages/brain-contracts/' },
      to: { path: '^packages/(?!brain-contracts/)' },
    },
    {
      name: 'evidence-contracts-depends-on-nothing',
      comment: '@brain/evidence-contracts is pure data (M43, dormant); it must import nothing else.',
      severity: 'warn',
      from: { path: '^packages/brain-evidence-contracts/' },
      to: { path: '^packages/(?!brain-evidence-contracts/)' },
    },
    {
      name: 'evidence-store-imports-only-evidence-contracts',
      comment: '@brain/evidence-store (M44, dormant) may import only @brain/evidence-contracts (+ self) — no storage/engine/Core.',
      severity: 'warn',
      from: { path: '^packages/brain-evidence-store/' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(brain-evidence-store/|brain-evidence-contracts/)',
      },
    },
    {
      name: 'evidence-gateway-imports-only-evidence-layer',
      comment: '@brain/evidence-gateway (M45, dormant) may import only @brain/evidence-contracts + @brain/evidence-store (+ self) — no storage/engine/Core.',
      severity: 'warn',
      from: { path: '^packages/brain-evidence-gateway/' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(brain-evidence-gateway/|brain-evidence-contracts/|brain-evidence-store/)',
      },
    },
    {
      name: 'evidence-weighting-imports-only-evidence-contracts',
      comment: '@brain/evidence-weighting (M47, dormant) may import only @brain/evidence-contracts (+ self) — pure maths, no storage/engine/Core.',
      severity: 'warn',
      from: { path: '^packages/brain-evidence-weighting/' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(brain-evidence-weighting/|brain-evidence-contracts/)',
      },
    },
    {
      name: 'packages-only-import-contracts',
      comment: 'brain-products / brain-versioning may import only @brain/contracts (+ self).',
      severity: 'warn',
      from: { path: '^packages/(brain-products|brain-versioning)/' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(brain-contracts/|brain-products/|brain-versioning/)',
      },
    },
    {
      name: 'platform-not-importing-engines-or-core',
      comment: 'Platform packages must never import Brain engines or Coach\'s Eye Core.',
      severity: 'warn',
      from: { path: '^packages/' },
      to: { path: '^(ai-brain|coach-products|app|api|src)/' },
    },
    {
      name: 'host-not-importing-core',
      comment: 'The Coach\'s Eye host adapter may import the façade + engines, but never Core.',
      severity: 'warn',
      from: { path: '^host-coaches-eye/' },
      to: { path: '^(app|api|src)/' },
    },

    // ── Experience Layer (M32) boundary rules — report-only ──────────────────
    {
      name: 'experience-imports-facade-and-self-only',
      comment: 'The Experience Layer imports only itself; never an AI engine, Coach\'s Eye Core, the host adapter, the live composition root (experience-host), or @brain platform internals. The brain reaches the app ONLY via runtime injection (experience/app/brain-provider.js), so the browser bundle stays standalone. (From M33 the brain is reachable only via @brain/product-coaches-eye.)',
      severity: 'warn',
      from: { path: '^experience/' },
      to: {
        path: '^(ai-brain|coach-products|app|api|src|experience-host|host-coaches-eye|packages/brain-contracts|packages/brain-products|packages/brain-versioning)/',
      },
    },
    {
      name: 'render-layers-are-pure',
      comment: 'Experience render layers (visuals/components/shell/panels) must not import the adapter or the dev-only placeholders. Data is composed by experience/app/ and injected as props.',
      severity: 'warn',
      from: { path: '^experience/(visuals|components|shell|panels)/' },
      to: { path: '^experience/(adapter|placeholders)/' },
    },
    {
      name: 'placeholders-are-dev-only',
      comment: 'The dev-only placeholders are importable only by the experience/app/ bootstrap.',
      severity: 'warn',
      from: { path: '^experience/', pathNot: '^experience/(app|placeholders)/' },
      to: { path: '^experience/placeholders/' },
    },
    {
      name: 'no-reverse-into-experience',
      comment: 'Nothing in the engines / Core / @brain / host may import the Experience Layer.',
      severity: 'warn',
      from: { path: '^(ai-brain|coach-products|app|api|src|host-coaches-eye|packages)/' },
      to: { path: '^experience/' },
    },
    {
      name: 'experience-host-composes-approved-only',
      comment: 'The live composition root (experience-host) reaches the Brain ONLY via the approved façade + host runtime port; it must never import an AI engine or Coach\'s Eye Core directly.',
      severity: 'warn',
      from: { path: '^experience-host/' },
      to: { path: '^(ai-brain|coach-products|app|api|src)/' },
    },
    {
      name: 'no-orphans',
      comment: 'Flag unreferenced platform modules (informational).',
      severity: 'info',
      from: { orphan: true, pathNot: '\\.(json|md)$' },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|app/.*/dist|experience/app/dist|\\.git)' },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
  },
  // Report-only is guaranteed by the rule severities above: every rule is
  // 'warn'/'info', and dependency-cruiser only sets a non-zero exit code on
  // 'error'-severity violations — so a run never fails CI in this phase.
}
