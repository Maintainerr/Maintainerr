# Leftover folder cleanup

When a collection action deletes media, Maintainerr delegates the delete over
HTTP to Radarr/Sonarr. What happens to the folder afterwards depends on which
endpoint the action uses, not on which \*arr it is:

- **Entity deletes** (`DELETE /movie/{id}?deleteFiles=true`,
  `DELETE /series/{id}?deleteFiles=true`) remove the whole item folder in the
  \*arr itself, sidecars and extras included. Nothing is left over.
- **Per-file deletes** (`DELETE /moviefile/{id}`, `DELETE /episodefile/{id}`)
  remove only the files the \*arr tracks. The folder and every stray `.srt`,
  `.nfo` and artwork file stay behind. The \*arr's own **Delete empty folders**
  option does not help here: it only removes a folder that is completely empty.

The optional **Clean up leftover folders** checkbox on a rule group (off by
default) makes Maintainerr remove that stranded folder. It is set per collection,
next to the \*arr action it modifies, and only appears when the action you picked
actually strands a folder.

## What it does

After a per-file delete, Maintainerr looks at the folder the deleted files came
from and removes it, along with the sidecar files left in it.

Covered actions (the checkbox is only offered for these):

| Collection type | Action                                                      | Folder cleaned |
| --------------- | ----------------------------------------------------------- | -------------- |
| movie           | Unmonitor and delete all files                               | movie folder   |
| show            | Unmonitor and delete all / existing episodes                 | series folder  |
| season          | Delete, Unmonitor and delete existing, Delete show if empty  | season folder  |

Not covered:

- **Entity deletes** (movie Delete, show Delete). The \*arr already removed the
  folder; calling cleanup there would only race its own delete.
- **Delete show if empty**, when the show did end up being deleted - the whole
  series folder goes with it in Sonarr.
- **Episode-level** deletes. The season folder is shared with the episodes that
  are kept.
- **Sportarr**. A league carries no folder path in its API, so there is no item
  folder to fence a delete against - unlike Radarr's `movie.path` and Sonarr's
  `series.path`.
- Deletes performed directly through the media server (Plex/Jellyfin/Emby, when
  no \*arr is configured).

## Requirement: same-path mount

Maintainerr only needs `/opt/data` for itself, so by default it cannot see the
media library. For this feature, **mount the library into the Maintainerr
container at the same path the \*arr reports** (e.g. if Radarr's movies are at
`/data/movies`, mount the same `/data/movies` into Maintainerr):

```yaml
services:
  maintainerr:
    volumes:
      - type: bind
        source: ./data
        target: /opt/data
      # Same path on both sides: Radarr reports /data/movies, so Maintainerr
      # has to see /data/movies too.
      - type: bind
        source: /path/to/media
        target: /path/to/media
```

The paths must match on both sides; a library mounted at a different path inside
Maintainerr is not recognized. When the root folders aren't visible, cleanup
no-ops and logs a warning saying so - it never guesses a path.

## Safety

Cleanup is best-effort and fail-closed - on any doubt the folder is left
untouched. Before removing anything it requires that the target:

- is an absolute path with no `..` segment, and is not a symlink;
- resolves (via `realpath`) to a real directory that is a **proper subfolder
  strictly inside a known \*arr root folder** - never a root itself, and never a
  folder that contains a root;
- **held at least one of the files the \*arr just deleted**, which is what proves
  it is the emptied folder and not a same-named directory from another mount;
- is not at or above another tracked movie/series folder (the same abstention
  Radarr and Sonarr make in their own delete handlers);
- for a season, sits strictly under the series folder (so a `seasonFolder=off`
  layout, where episodes live in the series root, is skipped);
- contains **nothing but recognized sidecar files** (subtitles, `.nfo`, artwork)
  and subdirectories of the same. This gate is an allowlist, not a media
  denylist, on purpose: a media file, an unrecognized extension, a symlink or any
  other non-regular entry keeps the folder, so a missing entry can only ever
  leave a folder uncleaned, never delete real data. A leftover trailer or sample
  is itself a video, so it too keeps the folder.

Only the files counted by that last gate are then deleted, one `unlink` at a
time, and the directories are removed bottom-up with a non-recursive `rmdir`. If
anything new appeared while the folder was being checked - an \*arr import
finishing, say - the `rmdir` fails and the folder survives, instead of a
recursive delete taking a file that was never classified.

Note that this bypasses the \*arr's Recycle Bin: the sidecars it removes are
deleted outright, not recycled. All actions are logged.
