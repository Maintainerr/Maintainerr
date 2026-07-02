# Leftover folder cleanup

When a collection action deletes media, Maintainerr delegates the delete over
HTTP to Radarr/Sonarr (or, with no \*arr configured, the media server). Radarr
removes the movie folder and its extras, but **Sonarr deletes only the files it
tracks** — the season/series folder and stray sidecars (`.srt`, `.nfo`,
trailers, samples) are left behind (the classic "Directory not empty").

The optional **Clean up leftover folders** setting (General settings, off by
default) makes Maintainerr force-remove that orphaned folder after a confirmed,
file-deleting \*arr action.

## What it does

After a successful Radarr/Sonarr delete that removes files, Maintainerr looks at
the item's folder (Radarr `movie.path`, Sonarr `series.path`, or the Sonarr
season folder) and removes it — including the leftover sidecars and subfolders.

Scope (v1):

- **Radarr** — the movie folder (usually already removed by Radarr; the call is
  idempotent).
- **Sonarr** — the whole-show folder, and the season folder for season-level
  actions. Episode-level deletes are **not** cleaned (the folder is shared with
  the season's other episodes).
- Deletes performed directly through the media server (Plex/Jellyfin/Emby, when
  no \*arr is configured) are **not** cleaned in v1.

## Requirement: same-path mount

Maintainerr only needs `/opt/data` for itself, so by default it cannot see the
media library. For this feature, **mount the library into the Maintainerr
container at the same path the \*arr reports** (e.g. if Radarr's movies are at
`/data/movies`, mount the same `/data/movies` into Maintainerr). When the folder
isn't visible, cleanup safely no-ops and logs a note — it never guesses a path.

## Safety

Cleanup is best-effort and fail-closed — on any doubt the folder is left
untouched. Before removing anything it requires that the target:

- is an absolute path with no `..` segment, and is not a symlink;
- resolves (via `realpath`) to a real directory that is a **proper subfolder
  strictly inside a known \*arr root folder** — never a root itself, and never a
  folder that contains a root;
- for a season, sits strictly under the series folder (so a `seasonFolder=off`
  layout, where episodes live in the series root, is skipped);
- contains **only recognized sidecar files** (subtitles, `.nfo`, artwork, and
  the like) plus empty subfolders. This gate is an allowlist, not a media
  denylist, on purpose: anything unrecognized — a media file, or just an
  extension we don't know — keeps the folder, so a missing entry can only ever
  leave a folder uncleaned, never delete real data. (A leftover trailer/extra
  that is itself a video therefore keeps the folder.)

Only then is the folder removed. All actions are logged.
