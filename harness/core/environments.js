// Single source of truth for environment URLs and safety flags.
// allowMutations: whether integration tests may run state-changing WP-CLI commands here.
// requiresConfirmFlag: whether `--confirm` must be passed on the CLI to target this env.
module.exports = {
  local: {
    baseUrl: 'http://localhost:8090',
    allowMutations: true,
    requiresConfirmFlag: false,
  },
  dev: {
    baseUrl: 'https://dev.colibridge.es',
    allowMutations: false,
    requiresConfirmFlag: false,
  },
  prod: {
    baseUrl: 'https://colibridge.es',
    allowMutations: false,
    requiresConfirmFlag: true,
  },
};
