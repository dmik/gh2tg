import type { SendMessage } from './telegram';


type UnknownObject = Record <string, unknown>;

// TODO: Bring a full typedef and get rid of `get` and `getFirst`
export type GitHubPayload = UnknownObject;

const Encoder = new TextEncoder ();
const MAX_COMMITS = 16;


function escapeHtml (value_: unknown): string
{
  return String (value_ ?? '')
  .replaceAll ('&', '&amp;')
  .replaceAll ('<', '&lt;')
  .replaceAll ('>', '&gt;')
  .replaceAll ('"', '&quot;');
}


function escapeAll (value_: unknown): string
{
  // Suppress automatic recognition of @mentions, #hashtags and scheme-less URLs in `sendMessage` by
  // enclosing the whole string in `<code>` (this is the only way to do it in HTML mode except using
  // invisible spaces or similar tricks, which is bad because it breaks copy-paste, searching etc.).
  // Note that in MarkdownV2 mode, we could simply escape '.' and '@' with '\', but it has its own
  // parsing problems (e.g. putting `pre` blocks inside expandable block quotes is not possible).
  // Note that the regexp is very broad, it matches anything that starts wih '@', '#' and also
  // anything that looks like a file path or an URL (with an arbitrary scheme not strictly following
  // RFC) - we assume that displaying it as inline code is fine.
  // Playground: https://regex101.com/r/dE8tbd/1
  return escapeHtml (value_)
  .replaceAll (/(^|[^\p{L}\p{M}\p{N}/\\#@.])([/\\#@]+|\.|[\p{L}\p{M}\p{N}]+:[/\\]{0,2}|[\p{L}\p{M}\p{N}_+%=$~./\\#@?-]*\.[\p{L}\p{M}\p{N}_+%=$~./\\#@?-]+)([\p{L}\p{M}\p{N}_+%=$~./\\#@?-]+)(?=[^\p{L}\p{M}\p{N}]|$)/gu,
  (match: string, pre: string, start: string, rest: string) =>
  {
    const startLower = start.toLowerCase ();
    // Keep some exceptions since Telegram should do what we need for those
    if ([ 'http://', 'https://', 'ftp://' ].includes (startLower))
      return match;
    // Make emails also work
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test (startLower === 'mailto:' ? rest : start + rest))
      return match;
    // The rest is code...
    return `${pre}<code>${start}${rest}</code>`;
  });
}


function link (label_: unknown, url_?: unknown): string
{
  if (! url_)
    return `${escapeHtml (label_)}`;
  return `<a href="${escapeHtml (url_)}">${escapeHtml (label_)}</a>`;
}

function boldLink (label_: unknown, url_?: unknown): string
{
  return `<b>${link (label_, url_)}</b>`;
}


function commitLink (id_: unknown, url_: unknown, isRepoUrl_ = false): string
{
  return link (String (id_ ?? '???????').slice (0, 7), id_ ? (isRepoUrl_ ? `${url_}/commit/${id_}` : url_) : undefined);
}


function commitRangeLink (label_: unknown, url_: unknown, from_: unknown, to_: unknown): string
{
  return link (label_, `${url_}/compare/${from_}^...${to_}`);
}


function refLink (name_: unknown, ref_: unknown, repoUrl_?: unknown): string
{
  return boldLink (name_, repoUrl_ ? `${repoUrl_}/tree/${ref_}` : undefined);
}


function repoLink (name_: unknown, url_: unknown, ownerName_: unknown, ownerUrl_: unknown): string
{
  return `${link (ownerName_, ownerUrl_)} / ${boldLink (name_, url_)}`;
}


function code (text_: string): string
{
  return `<code>${escapeHtml (text_)}</code>`;
}


function quote (text_: string): string
{
  return `<blockquote>${text_}</blockquote>`;
}

function expQuote (text_: string): string
{
  return `<blockquote expandable>${text_}</blockquote>`;
}


function get (payload_: GitHubPayload, path_: string): unknown
{
  return path_.split ('.').reduce <unknown> ((value, key) =>
  {
    if (! value || typeof value !== 'object')
      return undefined;
    return (value as UnknownObject) [key];
  }, payload_);
}


function getObject (payload_: GitHubPayload, path_: string): UnknownObject
{
  const value = get (payload_, path_);
  return value && typeof value === 'object' ? value as UnknownObject : {};
}


function getFirst (payload_: GitHubPayload, paths_: string): unknown
{
  for (const path of paths_.split ('|'))
  {
    const value = get (payload_, path);
    if (value !== null && value !== undefined)
      return value;
  }
  return undefined;
}


function getOrgHtmlUrl (payload_: GitHubPayload): string
{
  // No 'organization.html_url' in payload, adjust API URL (works for github.com only)
  return (get (payload_, 'organization.url') as string)?.replace ('//api.github.com/orgs/', '//github.com/');
}

function getResource (payload_: GitHubPayload): [ string, string, unknown ]
{
  let name, type, url;

  if (name = get (payload_, 'repository.name'))
  {
    const isPrivate = get (payload_, 'repository.private');
    type = `${isPrivate ? 'private' : 'public'} repository`;
    url = get (payload_, 'repository.html_url');

    const owner = getObject (payload_, 'repository.owner');
    return [ repoLink (name, url, getFirst (owner, 'name|login'), get (owner, 'html_url')), type, url ];
  }
  else if (name = get (payload_, 'organization.login'))
  {
    type = 'organization';
    url = getOrgHtmlUrl (payload_);
  }
  else
  {
    name = 'Unsupported resource';
    type = 'resource';
  }

  return [ `${boldLink (name, url)}`, type, url ];
}


function getRepoLabel (repo_: UnknownObject)
{
  return repoLink (repo_.name, repo_.html_url, getFirst (repo_, 'owner.name|owner.login'), get (repo_, 'owner.html_url'));
}


function getIssueLabel (issue_: UnknownObject, url_?: unknown)
{
  return `${code (`#${get (issue_, 'number')}`)} ${link (get (issue_, 'title'), url_ ?? get (issue_, 'html_url'))}`;
}


function getSenderLabel (payload_: GitHubPayload): string
{
  const sender = get (payload_, 'sender.login');
  if (! sender)
    return boldLink ('GitHub');
  return boldLink (sender, get (payload_, 'sender.html_url'));
}


export function formatGitHubEvent (event_: string, payload_: GitHubPayload): SendMessage | undefined
{
  const action = escapeHtml (payload_.action ?? 'did something with');
  const [ resName, resType, resUrl ] = getResource (payload_);
  const sender = getSenderLabel (payload_);

  switch (event_)
  {
    case 'ping':
      return [ `🏓 ${sender} connected ${resType} ${resName}`, ! resUrl ?
        false : { link_preview_options: { url: resUrl } } ];

    case 'push':
    {
      const ref = String (payload_.ref ?? '');
      const [ _, type, name ] = ref.split ('/');
      const isCreated = !! payload_.created;
      const isDeleted = !! payload_.deleted;
      const label = refLink (name ?? ref, ref, isDeleted ? undefined : resUrl);
      const commit = isDeleted ? payload_.before : payload_.after;
      const commitLabel = commitLink (commit, resUrl, true);
      const action = isCreated ? 'created ' : isDeleted ? 'deleted ' : '';
      const force = !! payload_.forced ? 'force-' : '';

      let subject, showCommits = ! isCreated && ! isDeleted;
      switch (type)
      {
        case 'heads':
          subject = `${action ? `${action}branch ` : ''}${label}`;
          break;
        case 'tags':
          subject = `${action}tag ${label}`;
          showCommits = false;
          break;
        default:
          subject = `${action}${label}`;
      }

      if (! showCommits)
        return [ `📦 ${sender} ${force}${subject} @ ${commitLabel} in ${resName}` ];

      const commits: UnknownObject [] = Array.isArray (payload_.commits) ? payload_.commits : [];
      const count = commits.length;
      let text = '';
      for (const [ i, commit ] of commits.entries ())
      {
        if (i >= MAX_COMMITS)
        {
          text += `\n…and ${commitRangeLink (`${count - i} more`, resUrl, commit.id, commits [count - 1].id)}`;
          break;
        }
        const message = String (commit.message ?? '');
        const nl = message.indexOf ('\n');
        text += `\n• ${commitLink (commit.id, commit.url)}: ${escapeAll (nl < 0 ? message : message.slice (0, nl))}`;
      }
      text = text.trim ();
      return [ `📦 ${sender} ${force}pushed ${link (`${count} commit${count === 1 ? '' : 's'}`, payload_.compare)} to ${subject} in ${resName}` + (text ? `\n\n${expQuote (text)}` : text) ];
    }

    case 'issues':
    case 'pull_request':
    {
      const [ icon, object, subject ] = event_ === 'issues'
        ? [ '📝', getObject (payload_, 'issue'), 'issue' ]
        : [ '🔀', getObject (payload_, 'pull_request'), 'pull request' ];
      const body = (action === 'opened') ? String (get (object, 'body') ?? '').trim () : '';
      const text = body ? `\n\n${expQuote (escapeAll (body))}` : body;
      return [ `${icon} ${sender} ${action} ${subject} ${getIssueLabel (object)} in ${resName}${text}` ];
    }

    case 'issue_comment':
    {
      const issue = getObject (payload_, 'issue');
      const subject = !! get (issue, 'pull_request') ? 'pull request' : 'issue';
      const [ body, actionText ] = (action === 'created')
        ? [ String (get (payload_, 'comment.body') ?? '').trim (), `commented on ${subject}` ]
        : [ '', `${action} ${subject} comment` ];
      const text = body ? `\n\n${expQuote (escapeAll (body))}` : body;
      return [ `💬 ${sender} ${actionText} ${getIssueLabel (issue, get (payload_, 'comment.html_url'))} in ${resName}${text}` ];
    }

    case 'pull_request_review':
      return [ `👀 ${sender} ${action} pull request review ${getIssueLabel (getObject (payload_, 'pull_request'), get (payload_, 'review.html_url'))} in ${resName}` ];

    case 'release':
      return [ `🚀 ${sender} ${action} release ${boldLink (getFirst (payload_, 'release.name|release.tag_name'), get (payload_, 'release.html_url'))} in ${resName}` ];

    case 'workflow_run':
      return [ `⚙️ ${sender} ${escapeHtml (get (payload_, 'workflow_run.conclusion') ?? action)} workflow ${boldLink (get (payload_, 'workflow_run.name'), get (payload_, 'workflow_run.html_url'))} in ${resName}` ];

    case 'star':
      return [ `⭐ ${sender} ${action} a star on ${resName}` ];

    case 'fork':
      return [ `🍴 ${sender} forked ${resName} as ${getRepoLabel (getObject (payload_, 'forkee'))}` ];

    case 'create':
    case 'delete':
      // Create/delete events are for branch/tag only, but for those GitHub always delivers richer
      // push events too; ignore them to avoid duplicates for the same logical action.
      return;

    default:
      return [ `🔔 ${sender} ${action} ${escapeHtml (event_)} in ${resName}` ];
  }
}


export async function verifyGitHubSignature (body_: string, signature_: string | null, secret_: string): Promise <boolean>
{
  if (! signature_?.match (/^sha256=[0-9a-f]{64}$/) || ! secret_)
    return false;

  const provided = new Uint8Array (32);
  for (let i = 0; i < provided.length; i += 1)
    provided [i] = Number.parseInt (signature_.slice (7 + i * 2, 9 + i * 2), 16);

  const key = await crypto.subtle.importKey ('raw', Encoder.encode (secret_), { name: 'HMAC', hash: 'SHA-256' }, false, [ 'sign' ]);
  const digest = await crypto.subtle.sign ('HMAC', key, Encoder.encode (body_));
  return crypto.subtle.timingSafeEqual (digest, provided);
}
