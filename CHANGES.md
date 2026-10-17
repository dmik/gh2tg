# Changelog

## Next

- Omit commit author link when author is push event sender.

## v0.1.1 - 2026-10-16

- Show Dependabot alert numbers, severity, and clickable summaries.
- Show workflow run numbers, triggers, and conclusions; identify re-runs.
- Suppress intermediate workflow notifications.
- Include Worker version and commit info in `/` and `/health` responses.

## v0.1.0 - 2026-10-13

- Add `check-fixtures` script to check formatting of different payloads.
- Enable previews in ping messages, replace resource type icons with text.
- Make sender, object and resource links bold, make other header text regular.
- Disable preview URLs (and warning) for `worker.dev` domains.
- Use expandable block-quotes for commit lists in push events.
- Show issue and comment bodies as expandable block-quotes.
- Show repo labels as two separate owner / repo links.
- Ignore GitHub create and delete events.
- Recognize branch/tag creation/deletion in GitHub push events.
- Suppress automatic recognition of @mentions and scheme-less URLs by Telegram.
- Move issue / pull request number out of link, remove bold from link.
- Show label names in label-related events.
- Use branch and tag icons for branch/tag creation/deletion events.
- Show assignee for assigned/unassigned actions in issue / pull request events.
- Show commit author if differs from sender/pusher.
- Show issue / pull request close reason.
- Show destination repository in issue / pull request transfer events.
- Support repository events.
- Ignore default label bootstrapping at repository creation.
- Support milestoned/demilestoned issue / pull request actions.
- Add support for separate Telegram group for private repository events.
- Move repository name to beginning of message for repository events.
- Show titles and descriptions (for created actions) in milestone events.
- License under PolyForm Noncommercial License 1.0.0.

## v0.0.1 - 2026-08-10

- Initial release.
