# Testing next-fetch-panel in a local Next.js app

The E2E fixture (`fixtures/nextjs-app/`) covers automated tests. When you want to try a change in a real project before publishing, link your local build into that app.

## Before you start

**Use the same Node version in both projects.** This repo pins it in `.tool-versions`. `npm link` registers the package in the global `node_modules` of the Node version that ran it. If the app runs on a different version (another asdf/nvm version, or a different `.tool-versions`), `npm link next-fetch-panel` either fails or links an older copy registered under that version.

Check it in both directories:

```bash
node -v
npm root -g   # must print the same path in both projects
```

The app also needs the panel wired up as described in the README's [Wiring it up](README.md#wiring-it-up) section.

## Linking

```bash
# 1. In this repo
npm run build
npm link

# 2. In the Next.js app
npm link next-fetch-panel
rm -rf .next
npm run dev
```

Then hard reload the browser (Cmd+Shift+R / Ctrl+Shift+R).

**Always remove `.next` after linking or rebuilding the library.** Next.js caches compiled `node_modules` code in `.next` and doesn't reliably notice when a linked package changes, so it can keep serving the old version.

## Iterating on changes

Keep the library rebuilding on save:

```bash
npm run dev   # tsup --watch
```

- `npm run dev` does **not** rebuild the panel CSS. After editing `src/panel/panel.css`, run `npm run build:css`. The watcher then picks up the regenerated styles.
- If a change doesn't show up in the app, stop its dev server, run `rm -rf .next`, and start it again.

## Unlinking

```bash
# In the Next.js app
npm unlink next-fetch-panel
npm install   # restores the version from package.json
```

## Troubleshooting

Start by confirming what the app is actually loading. Run these in the **app** directory:

```bash
ls -la node_modules/next-fetch-panel                                # should be a symlink (->) to this repo
grep -c "<some new string>" node_modules/next-fetch-panel/dist/index.js  # should be 1 or more
```

| Symptom                                                        | Cause                                                                                                 | Fix                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `node_modules/next-fetch-panel` is a folder, not a symlink     | `npm install` ran after linking and replaced the link with the registry version                       | Run `npm link next-fetch-panel` again                                                                        |
| `npm link next-fetch-panel` fails with a 404 or links old code | The app uses a different Node version than the one that ran `npm link` here                           | Switch to the version in `.tool-versions`, then run `npm link` in this repo and in the app again             |
| Symlink is correct but `grep` returns `0`                      | `dist/` is stale, or you're on a branch without the change                                            | Check `git branch --show-current` and run `npm run build`                                                    |
| Symlink and `grep` are correct but the UI shows the old code   | Next.js is serving cached code                                                                        | Stop the dev server, `rm -rf .next`, start it again, hard reload the browser                                 |
| Still the old UI after clearing `.next`                        | You're looking at another server: a different port, a container, or a production build (`next start`) | Make sure the browser points to the `npm run dev` you restarted. A production build needs a new `next build` |
| `Invalid hook call` / two copies of React                      | The linked package resolves `react` from this repo's `node_modules` instead of the app's              | Use the packed tarball below instead of `npm link`                                                           |
| Panel styles missing or outdated                               | `panel.css` changed but `npm run build:css` wasn't run                                                | Run `npm run build` (or `npm run build:css` while `npm run dev` is running)                                  |

### Alternative: install a packed tarball

This installs the library exactly as a user would get it from npm, which avoids symlink and duplicate-React problems. The downside is that you have to repeat it after every change.

```bash
# In this repo
npm run build && npm pack   # creates next-fetch-panel-<version>.tgz

# In the Next.js app
npm install /path/to/next-fetch-panel-<version>.tgz
rm -rf .next
npm run dev
```
