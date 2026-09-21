# Backdrop overlays

Maintainerr can apply a date overlay to the landscape backdrop used by clients
such as Infuse. The feature adds a `backdrop` template mode with a 1920×1080
canvas and a separate collection setting. Existing collections keep the poster
mode unless they explicitly select `backdrop`.

For Jellyfin, the implementation reads and replaces backdrop image index 0.
This is intentional: uploading through the unindexed endpoint appends another
backdrop, allowing a client to select the untouched original. The original is
stored separately as `<item-id>.backdrop.jpg` and restored with the same mode.

The first release targets Jellyfin. Other media-server providers continue to
support poster and title-card modes and must opt into backdrop support before
the UI exposes it for them.

## Rollout checklist

1. Run the server and UI type checks and overlay provider tests.
2. Apply the collection migration.
3. Create a backdrop template and assign it to one test collection.
4. Verify poster artwork is unchanged, the Jellyfin backdrop tag changes, and
   revert restores the original image.
5. Verify the detail view in Infuse before opening the upstream pull request.
