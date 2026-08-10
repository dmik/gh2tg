import { formatGitHubEvent, type GitHubPayload, verifyGitHubSignature } from './github';
import { readBodyWithLimit } from './http';
import { sendTelegram } from './telegram';
import { tryCatch } from './util';


export const MAX_WEBHOOK_BODY_BYTES = 25 * 1024 * 1024;


function json (body_: unknown, status_ = 200): Response
{
  return new Response (JSON.stringify (body_),
    {
      status: status_,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}


export async function handleRequest (request_: Request, env_: Env): Promise <Response>
{
  const url = new URL (request_.url);
  if (request_.method === 'GET' && (url.pathname === '/' || url.pathname === '/health'))
  {
    return json ({ ok: true, service: url.hostname });
  }

  if (url.pathname !== '/webhook')
    return json ({ error: 'Not found' }, 404);

  if (request_.method !== 'POST')
    return json ({ error: 'Method not allowed' }, 405);

  const body = await readBodyWithLimit (request_, MAX_WEBHOOK_BODY_BYTES);
  if (body === null)
    return json ({ error: 'GitHub webhook payload too large' }, 413);

  const valid = await verifyGitHubSignature (body, request_.headers.get ('x-hub-signature-256'), env_.GITHUB_WEBHOOK_SECRET);
  if (! valid)
    return json ({ error: 'Invalid GitHub signature' }, 401);

  const payload = tryCatch (() => JSON.parse (body) as GitHubPayload, null);
  if (payload === null)
    return json ({ error: 'Invalid JSON payload' }, 400);

  const event = request_.headers.get ('x-github-event') ?? 'unknown';
  const delivery = request_.headers.get ('x-github-delivery');

  try
  {
    await sendTelegram (formatGitHubEvent (event, payload), env_);
    return json ({ ok: true, event, delivery });
  }
  catch (error)
  {
    console.error ('Telegram delivery failed', { event, delivery, error });
    return json ({ error: 'Telegram delivery failed', delivery }, 502);
  }
}
