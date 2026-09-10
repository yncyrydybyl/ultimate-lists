# Ultimate lists

A keyboard-first, tag-based list and task management web app optimized for high-volume task management

## Motivation
- tried several task management tools but always ended up with simple text files in the end
- this tool tries to be as lightweight as a text file, but adds some semantics to the tasks
- text files have no tagging/grouping/deadline features, but this tool has :)

## Sharing a list in a Matrix room

ultimate lists can run as a **Matrix widget**. The list then syncs through the
room itself, so every member sees and edits the same list — no extra server, and
it keeps working offline.

See **[MATRIX-WIDGET.md](./MATRIX-WIDGET.md)** for setup, and read the trust
model section first: the list is shared with the whole room with no per-item
permissions, and in an encrypted room the stored snapshot is *not* encrypted.

Opened outside a Matrix client, the app runs exactly as before, with the list
stored locally in your browser.

## How to run
This project uses Yarn, Vite and TypeScript, and needs **Node ^20.19 || ^22.12
|| >=24** (Vite 8).

In order to start a dev server for local development, please run:

```shell
yarn
yarn dev
```

## How to build

```shell
yarn
yarn build
```

To restrict which Matrix clients may embed the widget:

```shell
VITE_ALLOWED_CLIENT_ORIGINS="https://app.element.io" yarn build   # web clients only, no desktop
```

## Type checking

```shell
yarn run check
```

## License

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](./LICENSE.md) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
