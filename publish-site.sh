#!/usr/bin/env bash

docker compose build && docker compose run --rm \
  -v "$(pwd)":/src \
  -v "$(realpath "${PROJECTS_LOCATION}")":/projects -e PROJECTS_LOCATION=/projects \
  -w /src -u "$(id -u)":"$(id -g)" \
  npm run build

EXIT_CODE=${PIPESTATUS[0]}

rsync -avzh --delete --log-file=rsync-log \
  ./build/public/ "$SSH_USERNAME"@"$SSH_HOST":/home/public

EXIT_CODE=${PIPESTATUS[0]}

exit "${EXIT_CODE}"
