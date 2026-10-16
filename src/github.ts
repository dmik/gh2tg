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
  return `${link (ownerName_, ownerUrl_)} ⟩ ${boldLink (name_, url_)}`;
}


function bold (text_: string): string
{
  return `<b>${escapeHtml (text_)}</b>`;
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


type RepoMessage =
{
  repo?: string;
  icon?: string;
  sender?: string;
  subject?: string;
  preposition?: string; // 'in' by default
  subject2?: string;
  body?: string;
  bodyEscape?: boolean; // true by default
  isPrivate?: boolean;
};


let newMessageStyle = true;

function repoMessage (msg_: RepoMessage): SendMessage
{
  const body = (msg_.bodyEscape ?? true) ? escapeAll (msg_.body) : msg_.body;
  const isPrivate = msg_.isPrivate;

  if (newMessageStyle)
  {
    const header = msg_.icon + (msg_.repo ? ` ${msg_.repo} : ` : ' ');
    const fields = [ msg_.sender, msg_.subject, msg_.subject2 ];
    return { text: header + fields.filter (Boolean).join (' ') + (body ? `\n\n${expQuote (body)}` : ''), isPrivate };
  }
  else
  {
    const fields = [ msg_.icon, msg_.sender, msg_.subject, msg_.preposition ?? 'in', msg_.repo, msg_.subject2 ];
    return { text: fields.filter (Boolean).join (' ') + (body ? `\n\n${expQuote (body)}` : ''), isPrivate };
  }
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

function getResource (payload_: GitHubPayload): { name: string, type: string, url: unknown, isPrivate: boolean }
{
  let name, type, url;

  if (name = get (payload_, 'repository.name'))
  {
    const isPrivate = !! get (payload_, 'repository.private');
    type = `${isPrivate ? 'private' : 'public'} repository`;
    url = get (payload_, 'repository.html_url');

    const owner = getObject (payload_, 'repository.owner');
    return { name: repoLink (name, url, getFirst (owner, 'name|login'), get (owner, 'html_url')), type, url, isPrivate };
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

  return { name: `${boldLink (name, url)}`, type, url, isPrivate: false };
}


function getRepoLabel (repo_: UnknownObject)
{
  return repoLink (repo_.name, repo_.html_url, getFirst (repo_, 'owner.name|owner.login'), get (repo_, 'owner.html_url'));
}


function getIssueLabel (issue_: UnknownObject, title_?: string, url_?: unknown)
{
  return `${code (`#${get (issue_, 'number')}`)} ${boldLink (title_ ?? get (issue_, 'title'), url_ ?? get (issue_, 'html_url'))}`;
}


function getIssueCloseReasonLabel (reason_: string, repoUrl_: unknown)
{
  // NOTE: Follow GitHub underscore rules: spaces for humans, dashes for issue search queries
  return `${boldLink ((reason_ || 'unknown').replaceAll ('_', ' '), reason_ && repoUrl_ ? `${repoUrl_}/issues/?q=state:closed%20reason:${encodeURIComponent (reason_.replaceAll ('_', '-'))}` : undefined)}`;
}


function getLabelLabel (label_: UnknownObject, repoUrl_: unknown)
{
  const labelName = get (label_, 'name');
  return `${boldLink (labelName ?? 'unknown', labelName && repoUrl_ ? `${repoUrl_}/issues/?q=label:${encodeURIComponent (`"${labelName}"`)}` : undefined)}`;
}


function getActorLabel (actor_: UnknownObject): string
{
  const actor = get (actor_, 'login');
  if (! actor)
    return boldLink ('GitHub');
  return boldLink (actor, get (actor_, 'html_url'));
}


export function formatGitHubEvent (event_: string, payload_: GitHubPayload): SendMessage | undefined
{
  const action = escapeHtml (payload_.action ?? 'did something with');
  const res = getResource (payload_);
  const senderObj = getObject (payload_, 'sender');
  const sender = getActorLabel (senderObj);
  const isGhost = senderObj?.login === 'ghost';
  const isPrivate = res.isPrivate;

  switch (event_)
  {
    case 'ping':
      return { text: `🏓 ${sender} connected ${res.type} ${res.name}`,
        options: ! res.url ? false : { link_preview_options: { url: res.url } },
        isPrivate };

    case 'repository':
    {
      const isCreated = action === 'created';
      const isPublicized = action === 'publicized';
      return { text: `📚 ${sender} ${action} ${isCreated ? res.type : event_} ${res.name}`,
        options: (! res.url || ! (isCreated || isPublicized)) ? false : { link_preview_options: { url: res.url } },
        isPrivate };
    }

    case 'public':
      // 'public' events are old notations for publicized actions in repository events, ignore them
      // to avoid duplicates (GitHub sends both for compatibility)
      return;

    case 'push':
    {
      const ref = String (payload_.ref ?? '');
      const [ _, type ] = ref.split ('/', 2);
      const name = ref.slice (_.length + 1 + (type?.length ?? 0) + 1);
      const pusher = getObject (payload_, 'pusher');
      const isCreated = !! payload_.created;
      const isDeleted = !! payload_.deleted;
      const label = refLink (name ?? ref, ref, isDeleted ? undefined : res.url);
      const commit = isDeleted ? payload_.before : payload_.after;
      const commitLabel = commitLink (commit, res.url, true);
      const action = isCreated ? 'created ' : isDeleted ? 'deleted ' : '';
      const force = !! payload_.forced ? 'force-' : '';

      let icon = '📦', subject, showCommits = ! isCreated && ! isDeleted;
      switch (type)
      {
        case 'heads':
          action
            ? (icon = '🪾', subject = `${action}branch ${label}`)
            : subject = label;
          break;
        case 'tags':
          icon = '🏷️';
          subject = `${action}tag ${label}`;
          showCommits = false;
          break;
        default:
          subject = `${action}${label}`;
      }

      if (! showCommits)
        return repoMessage ({ repo: res.name, icon, sender, subject: `${force}${subject} @ ${commitLabel}`, isPrivate });

      const commits: UnknownObject [] = Array.isArray (payload_.commits) ? payload_.commits : [];
      const count = commits.length;
      let body = '';
      for (const [ i, commit ] of commits.entries ())
      {
        if (i >= MAX_COMMITS)
        {
          body += `\n…and ${commitRangeLink (`${count - i} more`, res.url, commit.id, commits [count - 1].id)}`;
          break;
        }
        const author = getObject (commit, 'author');
        let authorLabel = '';
        if (author?.email !== pusher?.email)
        {
          // NOTE: TG does not support mailto:, construct a GitHub user link
          const authorLink = author?.username ? `https://github.com/${author.username}` : undefined;
          authorLabel = ` // ${boldLink (author.username ?? author.name ?? 'someone', authorLink)}`;
        }
        const message = String (commit.message ?? '');
        const nl = message.indexOf ('\n');
        let firstLine = (nl < 0 ? message : message.slice (0, nl)).trim ();
        firstLine = firstLine.replace (/(?<=[^.])\.$/, '');
        body += `\n• ${commitLink (commit.id, commit.url)}: ${escapeAll (firstLine)}${authorLabel}`;
      }
      body = body.trim ();
      return repoMessage ({ repo: res.name, icon, sender, subject: `${force}pushed ${link (`${count} commit${count === 1 ? '' : 's'}`, payload_.compare)} to ${subject}`, body, bodyEscape: false, isPrivate });
    }

    case 'issues':
    case 'pull_request':
    {
      const isIssue = event_ === 'issues';
      const [ icon, object, subject ] = isIssue
        ? [ '📝', getObject (payload_, 'issue'), 'issue' ]
        : [ '🔀', getObject (payload_, 'pull_request'), 'pull request' ];
      let actionText, body, actionText2 = '', subject2, preposition;
      switch (action)
      {
        case 'opened':
          body = String (get (object, 'body') ?? '').trim ();
          break;
        case 'closed':
          if (! isIssue) // pull request
            object.merged ? actionText = 'merged' : actionText2 = ' without merging';
          else if (object.state_reason)
            actionText2 = ` as ${getIssueCloseReasonLabel (String (object.state_reason), res.url)}`;
          break;
        case 'labeled':
          actionText = `added label ${getLabelLabel (getObject (payload_, 'label'), res.url)} to`;
          break;
        case 'unlabeled':
          // GitHub BUG: no '.label' in the payload for 'unlabeled' action
          actionText = 'removed some label from';
          break;
        case 'milestoned':
          actionText = 'added';
          actionText2 = ` to milestone ${getIssueLabel (getObject (payload_, 'milestone'))}`;
          break;
        case 'demilestoned':
          actionText = 'removed';
          actionText2 = ` from milestone ${getIssueLabel (getObject (payload_, 'milestone'))}`;
          break;
        case 'assigned':
        case 'unassigned':
        {
          const assignee = getObject (payload_, 'assignee');
          if (senderObj.id === assignee.id)
            actionText = `self-${action}`;
          else
            subject2 = `${action === 'assigned' ? 'to' : 'from'} ${getActorLabel (assignee)}`;
          break;
        }
        case 'transferred':
        {
          const changes = getObject (payload_, 'changes');
          preposition = 'from';
          subject2 = `to issue ${getIssueLabel (getObject (changes, 'new_issue'), '(〃)')} in ${getRepoLabel (getObject (changes, 'new_repository'))}`;
          break;
        }
      }
      return repoMessage ({ repo: res.name, icon, sender, subject: `${actionText ?? action} ${subject} ${getIssueLabel (object)}${actionText2}`, preposition, subject2, body, isPrivate });
    }

    case 'milestone':
    {
      const milestone = getObject (payload_, 'milestone');
      let actionText, title, subject2 = '', body;
      if (action === 'edited')
      {
        const oldTitle = String (get (payload_, 'changes.title.from') ?? '');
        if (oldTitle)
          actionText = 'renamed', title = oldTitle,
          subject2 = ` to ${boldLink (milestone.title, milestone.html_url)}`;
      }
      else if (action === 'created')
        body = String (milestone.description ?? '');
      return repoMessage ({ repo: res.name, icon: '🪧', sender, subject: `${actionText ?? action} milestone ${getIssueLabel (milestone, title)}${subject2}`, body, isPrivate });
    }

    case 'issue_comment':
    {
      const issue = getObject (payload_, 'issue');
      const subject = !! get (issue, 'pull_request') ? 'pull request' : 'issue';
      const [ body, actionText ] = (action === 'created')
        ? [ String (get (payload_, 'comment.body') ?? '').trim (), `commented on ${subject}` ]
        : [ '', `${action} ${subject} comment` ];
      return repoMessage ({ repo: res.name, icon: '💬', sender, subject: `${actionText} ${getIssueLabel (issue, undefined, get (payload_, 'comment.html_url'))}`, body, isPrivate });
    }

    case 'pull_request_review':
      return repoMessage ({ repo: res.name, icon: '👀', sender, subject: `${action} pull request review ${getIssueLabel (getObject (payload_, 'pull_request'), undefined, get (payload_, 'review.html_url'))}`, isPrivate });

    case 'label':
    {
      const isCreated = action === 'created';
      if (isCreated && isGhost)
        return; // Ignore default label bootstrapping at repository creation
      return repoMessage ({ repo: res.name, icon: '🔖', sender, subject: `${action} label ${getLabelLabel (getObject (payload_, 'label'), isCreated ? res.url : undefined)}`, isPrivate });
    }

    case 'release':
      return repoMessage ({ repo: res.name, icon: '🚀', sender, subject: `${action} release ${boldLink (getFirst (payload_, 'release.name|release.tag_name'), get (payload_, 'release.html_url'))}`, isPrivate });

    case 'workflow_run':
      return repoMessage ({ repo: res.name, icon: '⚙️', sender, subject: `${escapeHtml (get (payload_, 'workflow_run.conclusion') ?? action)} workflow ${boldLink (get (payload_, 'workflow_run.name'), get (payload_, 'workflow_run.html_url'))}`, isPrivate });

    case 'star':
      return repoMessage ({ repo: res.name, icon: '⭐', sender, subject: `${action} a star`, preposition: 'on', isPrivate });

    case 'fork':
      return repoMessage ({ repo: res.name, icon: '🍴', sender, subject: 'forked', preposition: '', subject2: `as ${getRepoLabel (getObject (payload_, 'forkee'))}`, isPrivate });

    case 'dependabot_alert':
    {
      const alert = getObject (payload_, 'alert');
      const isAssigneesChanged = action == 'assignees_changed';
      const isWithdrawn = ! isAssigneesChanged && action == 'withdrawn';
      const actionText = isAssigneesChanged ? 'changed assignees' : isWithdrawn ? 'withdrew' : action.replaceAll ('_', '-');
      const severity = String (get (alert, 'security_advisory.severity') ?? '');
      const summary = String (getFirst (alert, 'security_advisory.summary|security_advisory.ghsa_id') ?? '???');
      return repoMessage ({ repo: res.name, icon: '⚠️', sender, subject: `${actionText}${severity ? ` ${bold (severity)}` : ''} dependabot alert ${code (`#${get (alert, 'number')}`)} ${boldLink (summary, get (alert, 'html_url'))}`, isPrivate });
    }

    case 'repository_vulnerability_alert':
      // This event is deprecated in favor of dependabot_alert, ignore (fall through).
    case 'create':
    case 'delete':
      // Create/delete events are for branch/tag only, but for those GitHub always delivers richer
      // push events too; ignore them to avoid duplicates for the same logical action.
      return;

    default:
      return repoMessage ({ repo: res.name, icon: '🔔', sender, subject: `${action} ${escapeHtml (event_)}`, isPrivate });
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
