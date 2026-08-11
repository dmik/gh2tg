# Repository instructions

When adding or updating GitHub webhook payloads under `test/fixtures/`, sanitize webhook details consistently:

- Replace the hook ID with numeric `0` everywhere it occurs, including `hook_id`, `hook.id`, and hook API URL path segments.
- Replace the configured webhook destination URL with `https://gh2tg-dev.example.com/webhook`.
- Preserve all other real payload data, especially GitHub profile, repository, content, and avatar URLs. These must remain valid so Telegram links and previews can be tested and the fixtures can support future avatar rendering.
