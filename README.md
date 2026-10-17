# GitHub to Telegram Cloudflare Worker

A small Cloudflare Worker that receives GitHub events using GitHub webhooks, verifies their
HMAC-SHA256 signatures, and posts readable notifications to a Telegram group via a dedicated
Telegram bot.


## What it handles

- Individual repositories and GitHub.com organizations
- Pushes, issues, issue comments, pull requests, and reviews
- Milestones, releases, stars, and forks
- GitHub Actions (workflow runs) and Dependabot alerts
- GitHub `ping` events and a useful generic fallback for other events
- Auto-ignoring deprecated events in favor of richer replacements
- Hiding events from private repositories or posting them to another group
- Telegram-safe formatting and entity-aware long-message splitting
- `/` and `/health` health checks including the Worker version info


## Setup

There are two methods to create a Worker: from a local clone of this repository (manual deployment),
or by giving Cloudflare direct access to your GitHub fork of it (Cloudflare-managed deployment).
Both require a Cloudflare account, but a free account is enough unless you have an unusually high
volume of GitHub notifications.

Cloudflare-managed deployment is recommended because it requires no local setup and automatically
redeploys the Worker whenever the repository is updated.

Prerequisites for both methods:

1.  Create a Telegram bot with [@BotFather](https://t.me/BotFather), note its token and add the bot
    to the target group.

    NOTE: It is recommended to convert the group to a supergroup (by setting the chat history for
    new members to "visible" in the group's settings) before adding the bot. Supergroups are more
    powerful and doing this beforehand avoids reconfiguring the chat ID later as it will change
    after conversion.

2.  Obtain the group's chat ID. One simple method is to open
    `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` in a browser right after adding the bot to
    the group and inspect the response. Group IDs are usually negative; supergroup IDs normally
    begin with `-100`.

    If you want events from private repositories to be posted in another group, add the bot to that
    group and obtain its chat ID as described above.

    Note that you can also use your Telegram ID as the target chat ID for both public and private
    events. In this case, GitHub events will be posted to your private chat with the bot (you need
    to start a conversation with the bot before it can message you). You can find your Telegram ID
    (a positive number) in the `/getUpdates` response after sending the bot a message.


## Cloudflare-managed deployment

Requirements: A GitHub account for Cloudflare integration.

1.  Fork this repository under your GitHub account.

2.  In the [Cloudflare Dashboard](https://dash.cloudflare.com), go to **Workers & Pages**, then
    press **Create application**.

3.  Select **Connect with GitHub** and authorize Cloudflare in your GitHub account (or select
    **Continue with GitHub** if you are already authorized). When authorizing, you may choose to
    give Cloudflare access only to the newly created fork rather than to all of your repositories.

4.  Select the forked repository under your GitHub username, then press **Next**.

5.  Find **Enable Preview builds** on the **Setup your application** page and disable them, leaving
    all other settings at their defaults (adjust **Project name** if a Worker named `gh2tg` already
    exists in your Cloudflare account).

6.  Press **Deploy**.

    NOTE: Initial deployment will fail because Cloudflare does not let you set up secret variables
    required by the Worker before deployment. Wait until the build fails and ignore all warnings and
    errors at this step.

7.  Go to the failed Worker's **Settings** tab, then add the following required variables with the
    Telegram credentials and GitHub Webhook secret to the **Production environment** in the
    **Runtime variables and secrets** section (don't press **Add and deploy** before you add all of
    them):

    | Key                           | Value                                     | Secret?   |
    | ----------------------------- | ----------------------------------------- | --------- |
    | `TELEGRAM_BOT_TOKEN`          | `xxxxxxxxxx:replace-with-your-bot-token`  | Yes       |
    | `TELEGRAM_CHAT_ID`            | `-100xxxxxxxxx`                           | Yes       |
    | `GITHUB_WEBHOOK_SECRET`       | `replace-with-a-long-random-secret`       | Yes       |

    NOTE: By default, all events from private repositories are silently discarded. If you want to
    make them visible, add the secret variable `TELEGRAM_PRIVATE_CHAT_ID` with the target group ID
    (use the same ID as in `TELEGRAM_CHAT_ID` to use one group for public and private events).

8.  Press **Add N variables and deploy**.

    Note that this deploys the existing Worker code with added secrets; it does not retry the failed
    Git build.

9.  Press the red **Latest build failed** label on the Worker's tab bar, then press **Retry build**.

    The build should succeed. Note that if the **Project name** you selected is not `gh2tg`, there
    will be a warning about the name mismatch. It can be safely ignored, as well as warnings about
    `compatibility_date` and `workers_dev` mismatches between Cloudflare’s initial Worker settings
    and what the repository contains in `wrangler.jsonc`.

    NOTE: By default, Cloudflare will automatically rebuild the Worker whenever you push something
    to the configured **Production** branch of your fork (e.g. update it to the latest release). If
    you want to disable automatic rebuilds, turn on **Disable builds** in the **Builds** section of
    the Worker's **Settings**.

10. Once the Worker is successfully deployed (the *Deploying...* stage turns green), proceed to
    the next section to configure GitHub webhooks.


### Configuring GitHub webhooks

1.  Copy the Worker URL from its **Overview** page (usually
    `<project-name>.<your-workers-subdomain>.workers.dev`).

2.  In the GitHub repository, go to **Settings → Webhooks → Add webhook** and set:

    - Payload URL: `https://<your-worker-url>/webhook`
    - Content type: `application/json`
    - Secret: the exact `GITHUB_WEBHOOK_SECRET` value
    - Events: choose **Send me everything** or the events you want forwarded
    - Active: enabled

    NOTE: To avoid message duplication, deprecated events that have richer replacements (e.g.
    **Repository vulnerability alerts**, replaced with **Dependabot alerts**) are ignored even when
    selected in the webhook settings. Events that represent details of **Workflow runs** (e.g.
    **Workflow jobs**, **Check runs**, and **Check suites**) are also ignored to reduce the volume
    of GitHub Actions notifications.

If you have a GitHub organization and want to get notifications from all its repositories, you can
set up the webhook in the organization's settings instead.

GitHub should send a `ping`, and the Telegram group should receive a confirmation unless the
repository is private and no Telegram group is configured for private repository events. The GitHub
webhook delivery page is the best place to inspect a failed request (and attempt a redelivery
without creating a new repository event).

Note that the same Worker may be connected to more than one repository or organization by using the
same payload URL and secret in their GitHub webhooks.


## Manual deployment

Requirements: Node.js 22+.

1.  Clone this repository to a local directory and change to it.

2.  Install and authenticate Wrangler:

    ```sh
    npm install
    npx wrangler login
    ```

3.  Copy `.secrets.example` to `.secrets` and enter the Telegram credentials in `TELEGRAM_BOT_TOKEN`
    and `TELEGRAM_CHAT_ID`. Use the same random value for `GITHUB_WEBHOOK_SECRET` in this file and
    in GitHub webhook settings later.

    If you don't want events from private repositories to be posted, leave
    `TELEGRAM_PRIVATE_CHAT_ID` empty, otherwise set it to the target group's chat ID. Use the same
    ID as in `TELEGRAM_CHAT_ID` to use one group for both public and private events.

4.  Initialize the Worker environment using the created secrets file:

    ```sh
    npm run init
    ```

5.  Deploy:

    ```sh
    npm run deploy
    ```

    This will deploy the Worker with the service name `gh2tg` (creating a new worker if it does not
    exist) and URL `https://gh2tg.<your-workers-subdomain>.workers.dev`.

6.  Connect the Worker to a GitHub repository as described
    [above](#configuring-github-webhooks).


### Uninstallation

If you don't need the deployed Worker anymore (or want to start over), you can delete it with:

```sh
npm run delete
```

Note that this will also delete all secrets and all other data associated with this Worker.

It is recommended to **deactivate or delete all GitHub webhooks connected to this Worker** before
deleting it.


### Test setup

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
deployed in the test environment will have a different service name `gh2tg-test` and a different URL
`https://gh2tg-test.<your-workers-subdomain>.workers.dev`, which can be used in a dedicated test
repository.

When you don't need the test Worker anymore, you can delete it with:

```sh
npm run delete:test
```


### Local development

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
    - Domain: `<your-custom-domain>`
    - Service URL: `http://localhost:8787`

4.  Copy `.secrets.example` to `.dev.vars`, enter the development credentials.

    NOTE: `npm run dev` uses `wrangler-dev.sh` to pass all values from `.dev.vars` as local `--var`
    arguments to overcome `wrangler dev` limitations when using `secrets.required` in
    `wrangler.jsonc`. See `wrangler-dev.sh` for details.

5.  Run the Worker:

    ```sh
    npm run dev
    ```

6.  Use `https://gh2tg-dev.<your-custom-domain>/webhook` as the Payload URL in GitHub webhook
    settings.

It may be convenient to use the same Telegram bot and group that you use for testing, but you will
need to change the payload URL in the GitHub webhook settings accordingly. This way, you can use the
Redeliver button on the webhook's Recent Deliveries tab to redeliver events to the development
environment. Using GitHub's redelivery feature is usually easier than hand-building a request,
because requests must carry a valid GitHub signature.


### Version check

The version of the deployed Worker can be checked by opening the Worker URL in a browser (e.g. by
clicking on the URL in the Cloudflare **Workers & Pages** dashboard). The response format is:

```json
{"ok":true,"service":"<your-worker-url>","version":"X.Y.Z","commitDate":"YYYY-MM-DD","commitTag":"vX.Y.Z","commit":"<commit-SHA>"}
```

Wrangler automatically generates and bundles the version info before deployment, including manual
and Cloudflare-managed builds. The commit SHA is taken from `WORKERS_CI_COMMIT_SHA` when provided
(by Cloudflare builds), otherwise it is obtained from the local checkout. Builds fail if neither
supplies a valid SHA. Locally obtained commits have `-dirty` appended when Git reports uncommitted
changes (excluding ignored files). The commit date is in the Git-recorded timezone. The commit tag
is the first tag (in Git `refname` order), or `null` if the commit does not match any available tag.
Cloudflare-managed builds (`WORKERS_CI=1`) automatically fetch tags from `origin` before generating
metadata. A failed fetch fails the build instead of reporting incomplete release metadata. Manual
builds use local tags without fetching.


### Verification

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

## Notes

Secrets are never logged or committed. A failed Telegram API call returns `502`, causing GitHub to
record the delivery as failed so it can be redelivered.


## Copyright

Required Notice: Copyright © 2026 Dmitrii Kuminov (https://github.com/dmik/gh2tg).

Original repository: [dmik/gh2tg](https://github.com/dmik/gh2tg).

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).
