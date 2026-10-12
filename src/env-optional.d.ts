// Optional bindings are declared separately so Wrangler type generation preserves them.
interface OptionalEnv
{
  TELEGRAM_PRIVATE_CHAT_ID?: string;
}

interface Env extends OptionalEnv {}

// NOTE: Cloudflare is currently not used in the code; kept here to mirror env.d.ts.
declare namespace Cloudflare
{
  interface Env extends OptionalEnv {}
  interface TestEnv extends OptionalEnv {}
}
