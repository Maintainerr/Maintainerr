# Custom Collection Poster

Maintainerr can store one custom poster per Maintainerr-managed collection
and push it to the current media server. The stored file survives normal
collection recreation, so users do not need to re-upload artwork after Plex
or Jellyfin drops a collection and Maintainerr creates it again.

## Behavior

- Uploads accept JPEG, PNG, or WebP up to 10 MiB.
- The upload is normalized to JPEG and stored at
  `<dataDir>/collection-posters/{collectionDbId}.jpg`.
- Maintainerr writes the poster immediately on upload when a live
  `mediaServerId` exists.
- If the live push cannot run or fails, the local JPEG is still kept.
- When Maintainerr recreates that collection later, it re-pushes the stored
  JPEG automatically.
- Clearing the poster removes only Maintainerr's stored file. It does not
  reset Plex or Jellyfin back to their original artwork.
- Deleting a Maintainerr collection removes the stored poster file too.

This is intentionally a one-shot writer, not a polling loop. Maintainerr does
not keep reapplying collection posters on a schedule, so it does not fight
other artwork tools after the initial write.

## API

Endpoints live under `/api/collections/:id`.

### `GET /poster`

- Returns `200 image/jpeg` with the stored bytes when a custom poster exists.
- Returns `404` when no stored poster exists.

### `POST /poster`

- Multipart upload with file field `poster`.
- Returns `{ pushed: boolean, attempted: boolean }`.
- `attempted: false` means the poster was saved locally but no live upload was
  attempted because the collection has no live id yet or the current server is
  unavailable/unsupported.
- `attempted: true, pushed: false` means the local save succeeded and the live
  media-server push failed.
- Invalid image bytes return `400`.
- Storage failures are not remapped; they surface as normal `500`-class errors.

### `DELETE /poster`

- Returns `{ cleared: true }`.
- Removes only Maintainerr's stored file.

## Media Server Support

The feature is gated behind `MediaServerFeature.COLLECTION_POSTER` on the
shared media-server abstraction.

- Plex delegates to the existing poster upload/select flow in `setThumb`.
- Jellyfin delegates to `setItemImage(Primary)` for the BoxSet item.

The shared layer stays server-agnostic; Plex/Jellyfin specifics remain in
their respective adapters.

## UI

The picker lives in the rule-group AddModal and is available only after the
collection exists in Maintainerr.

- It probes the stored poster endpoint once when opened.
- Upload and clear actions update the preview with a cache-busted URL.
- Feedback is inline and tri-state: pushed, saved-local-only after attempted
  push failure, or saved-local-only because no live push was attempted.

## Other Tools

Maintainerr is not the only writer that may touch collection artwork.

- Kometa may later restore its own artwork depending on its overlay settings.
- Posterizarr is pure last-writer-wins.
- Manual artwork changes in Plex or Jellyfin can still replace Maintainerr's
  poster after the upload.

Maintainerr's restraint is deliberate: it writes on upload and on collection
recreation, then stops.

## Media-Server Switches

Two switch paths matter:

- `migrateRules: true`: collection rows are preserved, their DB ids stay the
  same, and stored posters remain mapped correctly. When the recreated
  collection gets a new live media-server id, Maintainerr re-pushes the stored
  JPEG on the new server.
- `migrateRules: false`: collections are wiped and the stored poster files for
  those deleted collection ids are removed as part of the switch cleanup.
