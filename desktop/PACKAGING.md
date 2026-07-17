# Packaging — Open Pedigree Windows Desktop (M4)

Produces two Windows deliverables from `desktop/`:

| Artifact | File | Use |
| --- | --- | --- |
| **Installer** | `release/OpenPedigree-Setup-<version>.exe` | Assisted NSIS installer. Defaults to a **per-user** install (no admin); the user may instead choose "all users", which triggers a UAC elevation prompt. User picks the install dir; creates desktop + Start-menu shortcuts. |
| **Portable** | `release/OpenPedigree-Portable-<version>.exe` | Single self-extracting exe, runs with no install. Good for U-disk / locked-down machines. |

Both are **x64**. The renderer runs fully offline; no network calls at runtime.

The packaged Electron (see `devDependencies.electron`) is kept on a **currently-supported
major** — do not let it drift onto an end-of-life major (EOL Chromium ships known sandbox
escapes). Bump it and re-run the full Windows regression + a repackage on each Electron
support-window rotation.

Hardening applied at package time via `build.electronFuses`: `RunAsNode`,
`EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` are **disabled**
(so the app binary can't be repurposed as a raw Node runtime or opened to a debugger via
env/CLI flags); `OnlyLoadAppFromAsar` is **enabled**; `EnableCookieEncryption` is enabled.

> ⚠️ **`GrantFileProtocolExtraPrivileges` must stay at its default (enabled).** This app
> loads every page over `file://` from inside `app.asar`; disabling that fuse strips the
> `file://` scheme of the privileges it needs and the window comes up blank
> (`ERR_FILE_NOT_FOUND` on `library.html`). Do not set it to `false`.
>
> **`EnableEmbeddedAsarIntegrityValidation` is deferred (off).** On this
> electron-builder 26 + Electron 41 + Windows combination, turning it on broke `file://`
> page loading; enabling it needs further compatibility work. Until then, post-install
> `app.asar` tampering is **not** blocked by the runtime — the mitigation for that is a
> signed installer (below) plus OS file permissions on the install dir.

## Prerequisites

- **Windows** host (or Windows CI runner) — NSIS is built natively, avoiding wine.
- Node 18+ and Python 3 (only for regenerating the icon).
- The renderer bundle must be staged into `desktop/renderer/` first (see below).

## Build steps

```powershell
# 1. From repo root — build the web bundle (webpack 4 needs legacy OpenSSL on modern Node).
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm install --ignore-scripts
npm run build

# 2. Stage the renderer payload into desktop/renderer/.
cd desktop
node stage.js

# 3. (optional) regenerate the icon.
python build/make-icon.py

# 4. Install desktop deps and package.
npm install
npm run dist          # both NSIS + portable
# or: npm run dist:nsis  /  npm run dist:portable
```

Output lands in `desktop/release/`.

### China / restricted networks

electron-builder downloads the Electron dist and its NSIS/winCodeSign binaries from
GitHub. Point them at a mirror to avoid TLS failures:

```powershell
$env:ELECTRON_MIRROR = "https://registry.npmmirror.com/-/binary/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://registry.npmmirror.com/-/binary/electron-builder-binaries/"
```

## Code signing

**A signed release is not optional for public distribution.** An unsigned exe means a
downloader cannot verify the publisher or that the file wasn't swapped on the mirror /
download page — SmartScreen's "unknown publisher" warning is only the visible symptom, not
the whole risk. Treat unsigned builds as **internal-test only**.

To sign:

1. Obtain an **OV or EV code-signing certificate** (`.pfx`). EV avoids the SmartScreen
   warning immediately; OV builds reputation over time.
2. Provide it to electron-builder via environment (never commit the cert):
   ```powershell
   $env:CSC_LINK = "C:\path\to\cert.pfx"        # or a base64 data URL / https URL
   $env:CSC_KEY_PASSWORD = "<pfx password>"
   npm run dist
   ```
3. In CI, set repo secrets `WINDOWS_CSC_LINK` (base64 of the .pfx) and
   `WINDOWS_CSC_KEY_PASSWORD`; the `desktop-release.yml` workflow wires them in.

**Fail-closed behaviour** (see `desktop-release.yml`):

- A tagged release (`v*` push) builds with `--config.forceCodeSigning=true`, so the build
  **fails** if no cert is configured — an unsigned release is impossible.
- A post-build step runs `Get-AuthenticodeSignature` on the installer, the portable exe,
  and the inner `Open Pedigree.exe`, and fails the job unless every one is `Valid`.
- `CSC_IDENTITY_AUTO_DISCOVERY=false` is set explicitly so the build never picks up a
  stray certificate from the runner's store.
- Manual `workflow_dispatch` builds default to **unsigned** (test) and opt into signing via
  the `sign` input.

## CI

`.github/workflows/desktop-release.yml` builds both artifacts on `windows-latest` on a
`v*` tag push or manual dispatch, and uploads them as workflow artifacts.

## What's inside the package

Only runtime files are bundled (see `build.files` in `package.json`):
`main.js`, `preload.js`, `documentStore.js`, `importDetect.js`, `library.html`,
`renderer/**` (the unused font-awesome SCSS sources are excluded). Tests, fixtures, and the
`.win` runner are excluded. App code is packed into `app.asar`. (Runtime ASAR integrity
validation is currently deferred — see the fuses note above.)

## Data location

On first run the app asks where to store the pedigree library (see `libraryConfig.js`).
Resolution order: `OPEN_PEDIGREE_LIBRARY` env var > a saved first-run choice > the picker.

- **Installed build**: default `%APPDATA%\Open Pedigree\pedigrees\` (per-user), independent
  of the install dir, so it survives upgrades and uninstall (`deleteAppDataOnUninstall: false`).
  The saved-choice pointer lives at `%APPDATA%\Open Pedigree\library-location.json`.
- **Portable build**: default `<exe folder>\OpenPedigree-Data\`, with the pointer at
  `<exe folder>\open-pedigree-data.json` — both next to the .exe, so the whole library
  travels with the app on a USB stick with no `%APPDATA%` dependency. Detected via the
  `PORTABLE_EXECUTABLE_DIR` env var that electron-builder's portable target sets.

Either way the first-run dialog also offers "Choose folder…" to store the library anywhere.

## Offline autocomplete

Gene (HGNC) and HPO phenotype pickers work fully offline. Bundled datasets
`data/genes.json` + `data/hpo.json` (built by `build/make-datasets.js`) are served to the
renderer over a privileged `opdata://` scheme (`main.js` + `offlineData.js`); in desktop
mode `nodeMenu.js` points the legacy Suggest widgets at `opdata://genes/` and `opdata://hpo/`
instead of the (network-only) PhenoTips services. Disorders remain free-text (OMIM is
licensed, not bundled).
