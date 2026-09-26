import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { formatGitHubEvent, type GitHubPayload } from '../src/github.ts';
import { sendMessage } from '../src/telegram.ts';


const FIXTURES_DIR = join (dirname (fileURLToPath (import.meta.url)), 'fixtures');
const BACK = Symbol ('back');
const QUIT = Symbol ('quit');


async function choose (prompt_: string, choices_: string [], back_ = false): Promise <string | typeof BACK | typeof QUIT>
{
  const commandsHelp = back_ ? '(B - back, Q - quit)' : '(Q - quit)';
  const commands = back_ ? 'B or Q' : 'Q';

  console.log (`\n${prompt_} ${commandsHelp}:`);
  choices_.forEach ((choice, index) => console.log (`  ${index + 1}. ${choice}`));

  while (true)
  {
    const answer = (await input.question ('> ')).trim ();
    if (answer.toLowerCase () === 'q')
      return QUIT;
    if (back_ && answer.toLowerCase () === 'b')
      return BACK;

    const index = Number (answer) - 1;
    if (Number.isInteger (index) && choices_ [index])
      return choices_ [index];

    console.log (choices_.length
      ? `Enter a number from 1 to ${choices_.length}, ${commands}.`
      : `No fixtures found; enter ${commands}.`);
  }
}


async function directories (path_: string): Promise <string []>
{
  return (await readdir (path_, { withFileTypes: true }))
  .filter ((entry) => entry.isDirectory ())
  .map ((entry) => entry.name)
  .sort ((a, b) => a.localeCompare (b));
}


async function jsonFiles (path_: string): Promise <string []>
{
  return (await readdir (path_, { withFileTypes: true }))
  .filter ((entry) => entry.isFile () && entry.name.endsWith ('.json'))
  .map ((entry) => entry.name)
  .sort ((a, b) => a.localeCompare (b));
}


process.loadEnvFile (join (dirname (FIXTURES_DIR), '..', '.dev.vars'));

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const privateChatId = process.env.TELEGRAM_PRIVATE_CHAT_ID;
if (! token || ! chatId)
  throw new Error ('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .dev.vars');

const input = createInterface ({ input: process.stdin, output: process.stdout });

async function main (): Promise <void>
{
  while (true)
  {
    const event = await choose ('Choose a GitHub event', await directories (FIXTURES_DIR));
    if (typeof event !== 'string')
      return;

    while (true)
    {
      const file = await choose (`Choose a ${event} fixture`, await jsonFiles (join (FIXTURES_DIR, event)), true);
      if (file === QUIT)
        return;
      if (file === BACK)
        break;

      const payload = JSON.parse (await readFile (join (FIXTURES_DIR, event, file), 'utf8')) as GitHubPayload;
      const message = formatGitHubEvent (event, payload);

      if (message)
      {
        console.log (`\n${message.text}\n\nOptions: ${JSON.stringify (message.options)}\nIsPrivate: ${message.isPrivate}\n`);

        const rc = await sendMessage (message,
        {
          GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? '',
          TELEGRAM_BOT_TOKEN: token,
          TELEGRAM_CHAT_ID: chatId,
          TELEGRAM_PRIVATE_CHAT_ID: privateChatId,
        });

        console.log (`${rc ? 'Sent' : 'Did not send'} '${event}/${file}' to Telegram.`);
      }
      else
        console.log (`\nIgnoring '${event}/${file}'; didn't produce a message.`);
    }
  }
}


try
{
  await main ();
}
finally
{
  input.close ();
}
