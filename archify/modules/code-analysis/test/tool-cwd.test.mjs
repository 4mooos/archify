import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleRoot = fileURLToPath(new URL('..', import.meta.url));

// Windows looks up a bare command in the child's working directory before
// PATH. A relative PATH entry gives POSIX the same lookup, so planted tools in
// the directory the analysis starts from must never be the ones that run.
test('analysis does not run git or go planted in the caller directory', { skip: process.platform === 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-tool-cwd-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const marker = path.join(root, 'planted-ran');
  for (const name of ['git', 'go']) {
    fs.writeFileSync(path.join(root, name), `#!/bin/sh\necho ${name} >> "${marker}"\nexit 1\n`, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.org/app\ngo 1.18\n');
  fs.writeFileSync(path.join(root, 'entry.go'), 'package app\nfunc Work() {}\nfunc Entry() { Work() }\n');
  const run = (...args) => assert.equal(spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' }).status, 0);
  run('init', '-q');
  run('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'base');

  const href = file => pathToFileURL(path.join(moduleRoot, file)).href;
  const script = `
    const { describeRepository } = await import(${JSON.stringify(href('extract/shared/git.mjs'))});
    const { extractFacts, loadConfig, mergeConfig } = await import(${JSON.stringify(href('lib/analysis.mjs'))});
    const facts = extractFacts('.', { language: 'go', config: mergeConfig(loadConfig(), { go: { stdlib: false } }) }).facts;
    console.log(JSON.stringify({ repository: describeRepository('.'), language: facts.repository.language }));
  `;
  const env = { ...process.env, PATH: `.${path.delimiter}${process.env.PATH}` };
  delete env.ARCHIFY_GO;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env, encoding: 'utf8' });
  assert.equal(fs.existsSync(marker), false, fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.repository.baseRevision, /^[a-f0-9]{40}$/);
  assert.equal(output.repository.root, '.');
  assert.equal(output.language, 'go');
});
