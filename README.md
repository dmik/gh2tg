# GitHub to Telegram Cloudflare Worker

A small Cloudflare Worker that receives GitHub events using GitHub webhooks, verifies their
HMAC-SHA256 signatures, and posts readable notifications to a Telegram group via a dedicated
Telegram bot.


## What it handles

- Individual repositories and GitHub.com organizations
- Pushes, issues, issue comments, pull requests, and reviews
- Releases, workflow runs, stars, and forks
- GitHub `ping` events and a useful generic fallback for other events
- Telegram-safe formatting and entity-aware long-message splitting
- `/` and `/health` health checks


## Setup

Requirements: Node.js 22+ and a Cloudflare account. A free account is enough unless you have an
unusually high volume of GitHub notifications.

1.  Create a Telegram bot with [@BotFather](https://t.me/BotFather), note its token and add it to
    the target group.

    NOTE: If necessary, convert the group to a supergroup (by setting the chat history for new
    members to "visible" in the group's settings) before adding the bot. This avoids reconfiguring
    the chat ID later as it will change after conversion.

2.  Obtain the group's chat ID. One simple method is to inspect
    `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` right after adding the bot to the group.
    Group IDs are usually negative; supergroup IDs normally begin with `-100`.

3.  Install and authenticate Wrangler:

```sh
npm install
npx wrangler login
```

4.  Copy `.secrets.example` to `.secrets` and enter the Telegram credentials. Use the same random
    value for `GITHUB_WEBHOOK_SECRET` in this file and in GitHub webhook settings later.

5.  Initialize the Worker environment using the created secrets file:

```sh
npm run init
```

6.  Deploy:

```sh
npm run deploy
```

7.  In the GitHub repository, go to **Settings → Webhooks → Add webhook** and set:

    - Payload URL: `https://gh2tg.<your-subdomain>.workers.dev/webhook`
    - Content type: `application/json`
    - Secret: the exact `GITHUB_WEBHOOK_SECRET` value
    - Events: choose the events you want forwarded
    - Active: enabled

If you have a GitHub organization and want to get notifications from all its repositories, you can
set up the webhook in the organization's settings instead.

GitHub should send a `ping`, and the Telegram group should receive a confirmation. The GitHub
webhook delivery page is the best place to inspect a failed request.

Note that the same Worker may be connected to more than one repository or organization by using the
same payload URL and secret in their GitHub webhooks.

The deployed Worker can be deleted with:

```sh
npm run delete
```

Note that this will also delete all secrets and all other data associated with this Worker. It is
recommended to deactivate or delete all GitHub webhooks connected to this Worker before deleting it.


## Test setup

It may be useful to test the deployment with an alternate configuration in a dedicated test
environment. Copy `.secrets.example` to `.secrets.test`, enter the test credentials, then activate
them:

```sh
npm run init:test
```

Then deploy the test Worker:

```sh
npm run deploy:test
```

To avoid conflicts with the default deployment, use a separate Telegram bot and group. The Worker
deployed in the test environment will have a different service name and a different payload URL
`https://gh2tg-test.<your-subdomain>.workers.dev/webhook`, which can be used in a dedicated test
repository.

When you don't need the test Worker anymore, you can delete it with:

```sh
npm run delete:test
```


## Local development

Local development requires a tunnel to forward GitHub webhook requests to the local machine. The
simplest way is to use a custom domain on your Cloudflare account and a Cloudflare tunnel.

1.  Create a new tunnel:

```sh
npx wrangler tunnel create gh2tg-dev
```

2.  In the [Cloudflare Dashboard](https://dash.cloudflare.com), go to **Networking → Tunnels →
    gh2tg-dev → Routes → Add route → Published application**.

3.  Configure:

    - Subdomain: `gh2tg-dev`
    - Domain: `<your_custom_domain>`
    - Service URL: `http://localhost:8787`

4.  Copy `.secrets.example` to `.dev.vars`, enter the development credentials.

5.  Run the Worker:

```sh
npm run dev
```

6.  Use `https://gh2tg-dev.<your_domain>/webhook` as the Payload URL in GitHub webhook settings.

It may be convenient to use the same Telegram bot and group that you use for testing, but you will
need to change the payload URL in the GitHub webhook settings accordingly. This way, you can use the
Redeliver button on the webhook's Recent Deliveries tab to redeliver events to the development
environment. Using GitHub's redelivery feature is usually easier than hand-building a request,
because requests must carry a valid GitHub signature.


## Verification

The test suite runs inside the Cloudflare Workers runtime using the Workers Vitest integration.
Runtime types come from `@cloudflare/workers-types`, so type-checking does not generate files.
Run `npm run types` only after changing bindings in `wrangler.jsonc`; it updates the small
project-specific `src/env.d.ts` declaration.

```sh
npm run verify
```

To send a saved GitHub payload through the formatter to the Telegram chat configured in `.dev.vars`,
put it at `test/fixtures/<x-github-event>/<name>.json` and run:

```sh
npm run check-fixtures
```

The command first prompts for the event directory and then for a JSON fixture in that directory.

# Notes

Secrets are never logged or committed. A failed Telegram API call returns `502`, causing GitHub to
record the delivery as failed so it can be redelivered.
