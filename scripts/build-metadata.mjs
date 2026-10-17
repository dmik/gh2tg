import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';


const root = new URL ('../', import.meta.url);
const upstream = 'https://github.com/dmik/gh2tg';
const workersCI = process.env.WORKERS_CI === '1';
let fetchedUpstreamTags = false;
const ciCommit = process.env.WORKERS_CI_COMMIT_SHA?.trim ();
let commit = ciCommit ||
  execFileSync ('git', [ 'rev-parse', 'HEAD' ], { cwd: root, encoding: 'utf8' }).trim ();

if (! /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test (commit))
  throw new Error ('Expected a full Git commit SHA');

// Cloudflare checkouts may omit tags. Refresh them before resolving release metadata.
if (workersCI)
{
  execFileSync ('git', [ 'fetch', '--force', '--prune', '--no-recurse-submodules', 'origin', '+refs/tags/*:refs/tags/*' ], { cwd: root, stdio: 'inherit' });
  const origin = execFileSync ('git', [ 'remote', 'get-url', 'origin' ], { cwd: root, encoding: 'utf8' }).trim ();
  const upstreamURL = new URL (upstream);
  const escapeRegExp = (value) => value.replace (/[.*+?^${}()|[\]\\]/g, '\\$&');
  const host = escapeRegExp (upstreamURL.hostname);
  const repo = escapeRegExp (upstreamURL.pathname.slice (1));
  const isUpstream = new RegExp (String.raw`^(?:https?://${host}/|(?:ssh://)?git@${host}[:/])${repo}(?:\.git)?/?$`, 'i').test (origin);
  if (! isUpstream)
  {
    execFileSync ('git', [ 'fetch', '--force', '--prune', '--no-tags', '--no-recurse-submodules', upstream, '+refs/tags/*:refs/upstream-tags/*' ], { cwd: root, stdio: 'inherit' });
    fetchedUpstreamTags = true;
  }
}

const commitDate = execFileSync ('git', [ 'show', '-s', '--format=%cs', commit ], { cwd: root, encoding: 'utf8' }).trim ();
let commitTag = execFileSync ('git', [ 'tag', '--points-at', commit, '--sort=refname' ], { cwd: root, encoding: 'utf8' }).trim ().split ('\n') [0] || null;
if (! commitTag && fetchedUpstreamTags)
  commitTag = execFileSync ('git', [ 'for-each-ref', '--points-at', commit, '--sort=refname', '--format=%(refname:strip=2)', 'refs/upstream-tags/' ], { cwd: root, encoding: 'utf8' }).trim ().split ('\n') [0] || null;

if (! ciCommit && execFileSync ('git', [ 'status', '--porcelain', '--untracked-files=normal' ], { cwd: root, encoding: 'utf8' }).trim ())
  commit += '-dirty';

mkdirSync (new URL ('.build/', root), { recursive: true });
writeFileSync (new URL ('.build/metadata.json', root), JSON.stringify ({ commit, commitDate, commitTag }) + '\n');
