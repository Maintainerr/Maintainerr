# Backdrop overlays

Maintainerr can apply a date overlay to the landscape backdrop used by clients
such as Infuse. The feature adds a `backdrop` template mode with a 1920×1080
canvas and a separate collection setting. Existing collections keep the poster
mode unless they explicitly select `backdrop`.

For Jellyfin, the implementation synchronizes the landscape artwork types used
by clients: `Backdrop`, `Thumb`, and `Banner`. Before applying an overlay, all
existing images are backed up independently (`<item-id>.<type>.jpg`). Reverting
restores exactly those images and removes types that did not exist originally;
poster and backdrop state rows are tracked independently.

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
