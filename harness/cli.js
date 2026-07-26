#!/usr/bin/env node
const path = require('path');
const environments = require('./core/environments');
const { createSession, finalizeSession } = require('./core/session');
const { runSuite } = require('./core/runner');
const { Logger } = require('./core/logger');

const SUITE_DIRS = {
  smoke: 'tests/smoke',
  integration: 'tests/integration',
  all: 'tests',
};

function parseArgs(argv) {
  const args = { command: argv[0], env: null, suite: 'smoke', confirm: false };
  for (const arg of argv.slice(1)) {
    if (arg === '--confirm') args.confirm = true;
    else if (arg.startsWith('--env=')) args.env = arg.slice('--env='.length);
    else if (arg.startsWith('--suite=')) args.suite = arg.slice('--suite='.length);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== 'run') {
    console.error('Usage: node cli.js run --env=<local|dev|prod> [--suite=smoke|integration|all] [--confirm]');
    process.exit(1);
  }

  const envConfig = environments[args.env];
  if (!envConfig) {
    console.error(`Unknown environment "${args.env}". Valid options: ${Object.keys(environments).join(', ')}`);
    process.exit(1);
  }

  if (envConfig.requiresConfirmFlag && !args.confirm) {
    console.error(`Environment "${args.env}" requires --confirm to run tests against it. Refusing to proceed.`);
    process.exit(1);
  }

  const suiteDir = SUITE_DIRS[args.suite];
  if (!suiteDir) {
    console.error(`Unknown suite "${args.suite}". Valid options: ${Object.keys(SUITE_DIRS).join(', ')}`);
    process.exit(1);
  }

  const session = createSession(args.env, args.suite);
  const logger = new Logger(session.logPath);
  logger.log(`Starting session ${session.id} (env=${args.env}, suite=${args.suite}, baseUrl=${envConfig.baseUrl})`);

  const { exitCode, result } = await runSuite({
    session,
    suiteDir,
    baseUrl: envConfig.baseUrl,
    logger,
  });

  const record = finalizeSession(session, { exitCode, result });

  console.log('\n--- Session summary ---');
  console.log(`id:          ${record.id}`);
  console.log(`environment: ${record.environment}`);
  console.log(`result:      ${JSON.stringify(record.result)}`);
  console.log(`sessionFile: ${session.sessionJsonPath}`);

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Harness failed to run:', err);
  process.exit(1);
});
