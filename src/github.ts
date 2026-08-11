import type { SendMessage } from './telegram';


type UnknownObject = Record <string, unknown>;

// TODO: Bring a full typedef and get rid of `get` and `getFirst`
export type GitHubPayload = UnknownObject;

const Encoder = new TextEncoder ();
const MAX_COMMITS = 8;


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


function code (text_: string): string
{
  return `<code>${escapeHtml (text_)}</code>`;
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


function getResource (payload_: GitHubPayload): [ string, string, unknown ]
{
  let name, type, url;

  if (name = get (payload_, 'repository.full_name'))
  {
    type = `${get (payload_, 'repository.private') ? 'private ' : ''}repository`;
    url = get (payload_, 'repository.html_url');
  }
  else if (name = get (payload_, 'organization.login'))
  {
    // NOTE: No 'organization.html_url' in payload, adjust API URL (works for github.com only)
    type = 'organization';
    url = (get (payload_, 'organization.url') as string)?.replace ('//api.github.com/orgs/', '//github.com/');
  }
  else
  {
    name = 'Unsupported resource';
    type = 'resource';
  }

  return [ `${link (name, url)}`, type, url ];
}


function getSender (payload_: GitHubPayload): string
{
  const sender = get (payload_, 'sender.login');
  if (! sender)
    return link ('GitHub');
  return link (sender, get (payload_, 'sender.html_url'));
}


export function formatGitHubEvent (event_: string, payload_: GitHubPayload): SendMessage
{
  const action = escapeHtml (payload_.action ?? 'updated');
  const [ resName, resType, resUrl ] = getResource (payload_);
  const sender = getSender (payload_);

  switch (event_)
  {
    case 'ping':
      return [ `🏓 <b>${sender} connected ${resType}</b> ${resName}`, ! resUrl ?
        false : { link_preview_options: { url: resUrl } } ];

    case 'push':
    {
      const branch = escapeHtml (String (payload_.ref ?? '').replace ('refs/heads/', ''));
      const commits: UnknownObject [] = Array.isArray (payload_.commits) ? payload_.commits : [];
      const count = commits.length;
      let text = `📦 <b>${sender} pushed ${link (`${count} commit${count === 1 ? '' : 's'}`, payload_.compare)}</b> to 🪾 ${code (branch)} in ${resName}:\n`;
      for (const [ i, commit ] of commits.entries ())
      {
        if (i >= MAX_COMMITS)
        {
          text += `\n• …and ${count - i} more`;
          break;
        }
        const sha = String (commit.id ?? '???').slice (0, 7);
        const message = String (commit.message ?? '').split ('\n') [0];
        text += `\n• ${link (sha, commit.url)}: ${escapeHtml (message)}`;
      }
      return [ text ];
    }

    case 'issues':
      return [ `📝 <b>${sender} ${action} issue</b> ${link (`#${get (payload_, 'issue.number')} ${get (payload_, 'issue.title')}`, get (payload_, 'issue.html_url'))} in ${resName}` ];

    case 'issue_comment':
      return [ `💬 <b>${sender} ${action} issue comment</b> ${link (`#${get (payload_, 'issue.number')} ${get (payload_, 'issue.title')}`, get (payload_, 'comment.html_url'))} in ${resName}` ];

    case 'pull_request':
      return [ `🔀 <b>${sender} ${action} pull request</b> ${link (`#${get (payload_, 'pull_request.number')} ${get (payload_, 'pull_request.title')}`, get (payload_, 'pull_request.html_url'))} in ${resName}` ];

    case 'pull_request_review':
      return [ `👀 <b>${sender} ${action} pull request review</b> ${link (`#${get (payload_, 'pull_request.number')} ${get (payload_, 'pull_request.title')}`, get (payload_, 'review.html_url'))} in ${resName}` ];

    case 'release':
      return [ `🚀 <b>${sender} ${action} release</b> ${link (getFirst (payload_, 'release.name|release.tag_name'), get (payload_, 'release.html_url'))} in ${resName}` ];

    case 'workflow_run':
      return [ `⚙️ <b>${sender} ${escapeHtml (get (payload_, 'workflow_run.conclusion') ?? action)} workflow</b> ${link (get (payload_, 'workflow_run.name'), get (payload_, 'workflow_run.html_url'))} in ${resName}` ];

    case 'star':
      return [ `⭐ <b>${sender} ${action} a star</b> on ${resName}` ];

    case 'fork':
      return [ `🍴 <b>${sender} forked</b> ${resName} as ${link (get (payload_, 'forkee.full_name'), get (payload_, 'forkee.html_url'))}` ];

    default:
      return [ `🔔 <b>${sender} ${action} ${escapeHtml (event_)}</b> in ${resName}` ];
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
