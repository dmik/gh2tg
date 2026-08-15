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


function link (label_: unknown, url_?: unknown): string
{
  if (! url_)
    return `<u>${escapeHtml (label_)}</u>`;
  return `<a href="${escapeHtml (url_)}">${escapeHtml (label_)}</a>`;
}

function boldLink (label_: unknown, url_?: unknown): string
{
  return `<b>${link (label_, url_)}</b>`;
}


function commitRangeLink (label_: unknown, url_: unknown, from_: unknown, to_: unknown): string
{
  return `${link (label_, `${url_}/compare/${from_}^...${to_}`)}`;
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
      const branch = escapeHtml (String (payload_.ref ?? '').replace ('refs/heads/', ''));
      const commits: UnknownObject [] = Array.isArray (payload_.commits) ? payload_.commits : [];
      const count = commits.length;
      const header = `📦 ${sender} pushed ${link (`${count} commit${count === 1 ? '' : 's'}`, payload_.compare)} to ${code (branch)} in ${resName}`;
      let text = '';
      for (const [ i, commit ] of commits.entries ())
      {
        if (i >= MAX_COMMITS)
        {
          text += `\n…and ${commitRangeLink (`${count - i} more`, resUrl, commit.id, commits [count - 1].id)}`;
          break;
        }
        const sha = String (commit.id ?? '???????').slice (0, 7);
        const message = String (commit.message ?? '');
        const nl = message.indexOf ('\n');
        text += `\n• ${link (sha, commit.url)}: ${escapeHtml (nl < 0 ? message : message.slice (0, nl))}`;
      }
      text = text.trim ();
      return [ header + (text ? `\n\n${expQuote (text)}` : text) ];
    }

    case 'issues':
    {
      const body = (action === 'opened') ? String (get (payload_, 'issue.body') ?? '').trim () : '';
      const text = body ? `\n\n${expQuote (body)}` : body;
      return [ `📝 ${sender} ${action} issue ${boldLink (`#${get (payload_, 'issue.number')} ${get (payload_, 'issue.title')}`, get (payload_, 'issue.html_url'))} in ${resName}${text}` ];
    }

    case 'issue_comment':
    {
      const [ body, actionText ] = (action === 'created')
        ? [ String (get (payload_, 'comment.body') ?? '').trim (), 'commented on issue' ]
        : [ '', `${action} issue comment` ];
      const text = body ? `\n\n${expQuote (body)}` : body;
      return [ `💬 ${sender} ${actionText} ${boldLink (`#${get (payload_, 'issue.number')} ${get (payload_, 'issue.title')}`, get (payload_, 'comment.html_url'))} in ${resName}${text}` ];
    }

    case 'pull_request':
      return [ `🔀 ${sender} ${action} pull request ${boldLink (`#${get (payload_, 'pull_request.number')} ${get (payload_, 'pull_request.title')}`, get (payload_, 'pull_request.html_url'))} in ${resName}` ];

    case 'pull_request_review':
      return [ `👀 ${sender} ${action} pull request review ${boldLink (`#${get (payload_, 'pull_request.number')} ${get (payload_, 'pull_request.title')}`, get (payload_, 'review.html_url'))} in ${resName}` ];

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
