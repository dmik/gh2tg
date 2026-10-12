#!/bin/sh

#
# A `wrangler dev` wrapper that works around a questionable decision to filter out .dev.vars and
# .env entries which are not listed in secrets.required in wrangler.jsonc (when secrets.required is
# used). This functionality is inconsistent with `wrangler deploy` that does not do any filtering on
# deployed secrets and variables and only enforces the required ones to exist. In particular, it is
# impossible to supply values for optional secret variables in local development via normal
# `.dev.vars` processing, although doing so via deployed secrets is perfectly valid.
#
# For the sake of simplicity, this wrapper understands one `KEY=value` assignment per line.
# Whitespace around keys and values is trimmed. Surrounding single or double quotes, blank lines,
# and full-line comments are supported. Values are literal; inline comments, shell expansion, escape
# decoding, and multiline values are not supported. Key-value pairs are passed in reverse order, so
# if there are duplicate variable names, the first pair in .dev.vars wins. Original arguments passed
# to this wrapper itself are passed to `wrangler dev` after the ones constructed from .dev.vars, so
# any explicit --var will override a .dev.vars entry normally.
#

set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

while IFS= read -r line || [ -n "$line" ]; do
  key=${line%%=*}
  key=${key#"${key%%[![:space:]]*}"}
  key=${key%"${key##*[![:space:]]}"}
  case "$key" in
    ''|'#'*) continue ;;
  esac
  value=${line#*=}
  value=${value#"${value%%[![:space:]]*}"}
  value=${value%"${value##*[![:space:]]}"}
  case "$value" in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
  esac
  set -- --var "$key:$value" "$@"
done < "$script_dir/.dev.vars"

exec npx wrangler dev "$@"
