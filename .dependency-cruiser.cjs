/**
 * dependency-cruiser rules enforcing the architecture seams (NFR-MA-02 / C-07).
 * Run: pnpm --filter @geekbox/backend depcruise
 */
module.exports = {
  forbidden: [
    {
      name: 'no-bambu-outside-integration',
      comment:
        'ZERO Bambu adapter imports outside integration/ (ADR-006, NFR-MA-02). Bambu types must never cross the ACL.',
      severity: 'error',
      from: { pathNot: '^src/integration/' },
      to: { path: '^src/integration/bambu/' },
    },
    {
      name: 'no-fastify-outside-http-and-routers',
      comment:
        'Fastify may only be imported by the HTTP edge and module routers, not domain services.',
      severity: 'error',
      from: {
        pathNot: '(^src/http/|router\\.ts$|^src/app\\.ts$)',
      },
      to: { path: 'node_modules/fastify' },
    },
    {
      name: 'single-ledger-writer',
      comment:
        'ADR-009 single write path: LedgerWriter (ledger-write.ts) is the ONLY writer of spool_ledger_entry / spool.remaining_net_weight_g. It may be constructed in exactly one place — the DI container — and used everywhere else via injection. Forbidding imports of ledger-write.ts from outside inventory/ledger/ and the container prevents any second writer or ad-hoc instantiation from re-opening the bypass the dead LedgerRepository used to hide.',
      severity: 'error',
      from: { pathNot: '(^src/inventory/ledger/|^src/container\\.ts$)' },
      to: {
        path: '^src/inventory/ledger/ledger-write\\.ts$',
        // Type-only imports (constructor annotations for DI) are fine — they cannot
        // construct or call the writer. Only a runtime/value import can, and that is
        // what we forbid outside the ledger module and the DI container.
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js'],
    },
  },
};
