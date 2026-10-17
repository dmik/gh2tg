import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';


const root = new URL ('../', import.meta.url);
const ciCommit = process.env.WORKERS_CI_COMMIT_SHA?.trim ();
let commit = ciCommit ||
  execFileSync ('git', [ 'rev-parse', 'HEAD' ], { cwd: root, encoding: 'utf8' }).trim ();

if (! /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test (commit))
  throw new Error ('Expected a full Git commit SHA');

// Cloudflare checkouts may omit tags. Refresh them before resolving release metadata.
if (process.env.WORKERS_CI === '1')
  execFileSync ('git', [ 'fetch', '--force', '--prune', '--no-recurse-submodules', 'origin', '+refs/tags/*:refs/tags/*' ], { cwd: root, stdio: 'inherit' });

const commitDate = execFileSync ('git', [ 'show', '-s', '--format=%cs', commit ], { cwd: root, encoding: 'utf8' }).trim ();
const commitTag = execFileSync ('git', [ 'tag', '--points-at', commit, '--sort=refname' ], { cwd: root, encoding: 'utf8' }).trim ().split ('\n') [0] || null;

if (! ciCommit && execFileSync ('git', [ 'status', '--porcelain', '--untracked-files=normal' ], { cwd: root, encoding: 'utf8' }).trim ())
  commit += '-dirty';

mkdirSync (new URL ('.build/', root), { recursive: true });
writeFileSync (new URL ('.build/metadata.json', root), JSON.stringify ({ commit, commitDate, commitTag }) + '\n');
