import { parse_html } from '@telegraf/entity';


const TELEGRAM_TEXT_LIMIT = 4096;

type TelegramMessage = ReturnType <typeof parse_html>;


export function splitMessage (html_: string): TelegramMessage []
{
  const message = parse_html (html_);
  const chunks: TelegramMessage [] = [];
  let start = 0;

  while (start < message.text.length)
  {
    let end = Math.min (start + TELEGRAM_TEXT_LIMIT, message.text.length);
    if (end < message.text.length && /[\uD800-\uDBFF]/.test (message.text [end - 1]) && /[\uDC00-\uDFFF]/.test (message.text [end]))
      end -= 1;

    const newline = message.text.lastIndexOf ('\n', end - 1) + 1;
    if (end < message.text.length && newline > start + TELEGRAM_TEXT_LIMIT / 2)
      end = newline;

    const entities = message.entities.flatMap ((entity) =>
    {
      const overlapStart = Math.max (entity.offset, start);
      const overlapEnd = Math.min (entity.offset + entity.length, end);
      return overlapStart < overlapEnd
        ? [ { ...entity, offset: overlapStart - start, length: overlapEnd - overlapStart } ]
        : [];
    });
    chunks.push ({ text: message.text.slice (start, end), entities });
    start = end;
  }

  return chunks.length ? chunks : [ message ];
}


export async function sendTelegram (message_: string, env_: Env): Promise <void>
{
  const endpoint = `https://api.telegram.org/bot${env_.TELEGRAM_BOT_TOKEN}/sendMessage`;
  for (const chunk of splitMessage (message_))
  {
    const response = await fetch (endpoint,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify ({ chat_id: env_.TELEGRAM_CHAT_ID, ...chunk, disable_web_page_preview: true }),
    });
    if (! response.ok)
    {
      const detail = await response.text ();
      throw new Error (`Telegram API returned ${response.status}: ${detail.slice (0, 500)}`);
    }
  }
}
