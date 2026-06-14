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
      name: 'no-orphans',
      comment: 'Flag unreferenced platform modules (informational).',
      severity: 'info',
      from: { orphan: true, pathNot: '\\.(json|md)$' },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|app/.*/dist|\\.git)' },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
    // Report-only: do not let any violation set a non-zero exit code.
    exitCode: false,
  },
}
