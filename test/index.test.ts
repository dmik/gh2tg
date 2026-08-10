import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatGitHubEvent, verifyGitHubSignature } from '../src/github';
import { readBodyWithLimit } from '../src/http';
import { splitMessage } from '../src/telegram';
import { MAX_WEBHOOK_BODY_BYTES, handleRequest } from '../src/worker';


const env: Env =
{
  GITHUB_WEBHOOK_SECRET: 'It\'s a Secret to Everybody',
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_CHAT_ID: '-100123',
};


async function signature (body_: string): Promise <string>
{
  const key = await crypto.subtle.importKey ('raw', new TextEncoder ().encode (env.GITHUB_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [ 'sign' ]);
  const digest = await crypto.subtle.sign ('HMAC', key, new TextEncoder ().encode (body_));
  const hex = [ ...new Uint8Array (digest) ].map ((byte) => byte.toString (16).padStart (2, '0')).join ('');
  return `sha256=${hex}`;
}


afterEach (() => vi.restoreAllMocks ());


describe ('GitHub signature validation', () =>
{
  it ('matches GitHub\'s published test vector', async () =>
  {
    expect (await verifyGitHubSignature ('Hello, World!', 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17', env.GITHUB_WEBHOOK_SECRET)).toBe (true);
  });

  it ('rejects an invalid signature', async () =>
  {
    expect (await verifyGitHubSignature ('changed', 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17', env.GITHUB_WEBHOOK_SECRET)).toBe (false);
  });

  it ('rejects a malformed signature without comparing it', async () =>
  {
    expect (await verifyGitHubSignature ('Hello, World!', 'sha256=not-a-sha256-digest', env.GITHUB_WEBHOOK_SECRET)).toBe (false);
  });
});


describe ('webhook', () =>
{
  it ('rejects a declared oversized payload before reading it', async () =>
  {
    const response = await handleRequest (new Request ('https://worker.test/webhook',
      {
        method: 'POST',
        headers: { 'content-length': String (MAX_WEBHOOK_BODY_BYTES + 1) },
        body: '{}',
      }), env);
    expect (response.status).toBe (413);
  });

  it ('limits streamed bodies without a content-length header', async () =>
  {
    const request = new Request ('https://worker.test/webhook', { method: 'POST', body: 'four' });
    await expect (readBodyWithLimit (request, 3)).resolves.toBe (null);
  });

  it ('rejects unsigned requests', async () =>
  {
    const response = await handleRequest (new Request ('https://worker.test/webhook', { method: 'POST', body: '{}' }), env);
    expect (response.status).toBe (401);
  });

  it ('forwards a signed push to Telegram', async () =>
  {
    const body = JSON.stringify (
    {
      ref: 'refs/heads/main',
      compare: 'https://github.com/acme/app/compare/1...2',
      sender: { login: 'octopus' },
      repository: { full_name: 'acme/app', html_url: 'https://github.com/acme/app' },
      commits: [ { id: 'abcdef123456', message: 'Ship it' } ],
    });
    const fetchMock = vi.spyOn (globalThis, 'fetch').mockResolvedValue (new Response (JSON.stringify ({ ok: true }), { status: 200 }));
    const response = await handleRequest (new Request ('https://worker.test/webhook',
      {
        method: 'POST',
        headers: { 'x-hub-signature-256': await signature (body), 'x-github-event': 'push', 'x-github-delivery': 'delivery-1' },
        body,
      }), env);
    expect (response.status).toBe (200);
    expect (fetchMock).toHaveBeenCalledOnce ();
    const options = fetchMock.mock.calls [0] [1] as RequestInit;
    expect (String (options.body)).toContain ('octopus');
    expect (String (options.body)).toContain ('pushed');
    expect (String (options.body)).toContain ('1 commit');
  });

  it ('reacts to an organization webhook ping', () =>
  {
    const message = formatGitHubEvent ('ping',
    {
      organization:
      {
        login: 'acme',
        url: 'https://api.github.com/orgs/acme',
      },
    });
    expect (message).toContain ('connected');
    expect (message).toContain ('<a href="https://github.com/acme">acme</a>');
  });

  it ('reacts to an unsupported webhook ping', () =>
  {
    const message = formatGitHubEvent ('ping', {});
    expect (message).toContain ('connected');
    expect (message).toContain ('Unsupported resource');
  });
});


describe ('message formatting', () =>
{
  it ('escapes untrusted HTML', () =>
  {
    const message = formatGitHubEvent ('issues',
    {
      action: 'opened',
      sender: { login: '<admin>' },
      repository: { full_name: 'acme/app' },
      issue: { number: 1, title: 'Fix <script>', html_url: 'https://github.com/acme/app/issues/1' },
    });
    expect (message).toContain ('&lt;admin&gt;');
    expect (message).toContain ('Fix &lt;script&gt;');
    expect (message).not.toContain ('<script>');
  });

  it ('preserves Telegram entities across long-message chunks', () =>
  {
    const chunks = splitMessage (`<b>heading\n<a href="https://example.com">${'x'.repeat (5000)}</a></b>`);
    expect (chunks).toHaveLength (2);
    expect (chunks [0].text.length).toBeLessThanOrEqual (4096);
    expect (chunks [1].text.length).toBeLessThanOrEqual (4096);
    expect (chunks [0].entities.map ((entity) => entity.type)).toEqual ([ 'bold', 'text_link' ]);
    expect (chunks [1].entities.map ((entity) => entity.type)).toEqual ([ 'bold', 'text_link' ]);
    expect (chunks.map ((chunk) => chunk.text).join ('')).toBe (`heading\n${'x'.repeat (5000)}`);
  });

  it ('does not split an HTML entity', () =>
  {
    const chunks = splitMessage (`${'x'.repeat (4095)}&amp;y`);
    expect (chunks).toEqual (
      [
        { text: `${'x'.repeat (4095)}&`, entities: [] },
        { text: 'y', entities: [] },
      ]);
  });
});
