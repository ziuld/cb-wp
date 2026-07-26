const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HARNESS_VERSION = require('../package.json').version;
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..', '..') }).toString().trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: path.join(__dirname, '..', '..') }).toString().trim(),
    };
  } catch {
    return { commit: null, branch: null };
  }
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function createSession(environment, suite) {
  const id = `${timestampSlug()}_${environment}_${suite}`;
  const dir = path.join(SESSIONS_DIR, id);
  const artifactsDir = path.join(dir, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const { commit, branch } = gitInfo();

  return {
    id,
    dir,
    artifactsDir,
    logPath: path.join(dir, 'log.txt'),
    sessionJsonPath: path.join(dir, 'session.json'),
    environment,
    suite,
    gitCommit: commit,
    gitBranch: branch,
    trigger: 'manual',
    startedAt: new Date().toISOString(),
  };
}

function finalizeSession(session, { exitCode, result }) {
  const record = {
    id: session.id,
    startedAt: session.startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(session.startedAt),
    environment: session.environment,
    suite: session.suite,
    gitCommit: session.gitCommit,
    gitBranch: session.gitBranch,
    trigger: session.trigger,
    result,
    exitCode,
    artifactsPath: session.artifactsDir,
    logPath: session.logPath,
    harnessVersion: HARNESS_VERSION,
  };

  fs.writeFileSync(session.sessionJsonPath, JSON.stringify(record, null, 2));
  return record;
}

module.exports = { createSession, finalizeSession, SESSIONS_DIR };
