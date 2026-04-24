import {
  OverlayLibrarySection,
  OverlayPreviewItem,
  OverlayTemplateMode,
} from '@maintainerr/contracts';

/**
 * Server-agnostic contract for overlay-specific media-server interactions.
 *
 * Intentionally narrower than IMediaServerService — overlays are a feature,
 * not a core media-server responsibility, so the I/O and editor helpers the
 * overlay module needs live here. The overlay processor, controller, and
 * editor UI depend on this interface only; each supported media server
 * provides its own implementation in this directory.
 */
export interface IOverlayProvider {
  /**
   * True when the configured media server backing this provider is
   * initialised and ready to service overlay operations. Mirrors
   * IMediaServerService.isSetup() at the provider level.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Library sections suitable for the overlay editor's section picker.
   * Returns only movie and show libraries — music / photos etc. never carry
   * overlay-worthy artwork in this feature.
   */
  getSections(): Promise<OverlayLibrarySection[]>;

  /**
   * Pick a random movie or show from the given section keys (or across all
   * movie/show sections when omitted). Used for the editor's preview
   * background.
   */
  getRandomItem(sectionKeys?: string[]): Promise<OverlayPreviewItem | null>;

  /**
   * Pick a random episode from the given show section keys (or across all
   * show sections when omitted). Used for title-card template previews.
   */
  getRandomEpisode(sectionKeys?: string[]): Promise<OverlayPreviewItem | null>;

  /**
   * Download the artwork that `mode` targets:
   *   - 'poster'    → movie / show primary poster
   *   - 'titlecard' → episode title-card still (16:9)
   *
   * Providers map the mode to the server-native image kind internally.
   * Returns null when no artwork of that kind exists for the item.
   */
  downloadImage(
    itemId: string,
    mode: OverlayTemplateMode,
  ): Promise<Buffer | null>;

  /**
   * Replace the artwork targeted by `mode`. Upload semantics are a provider
   * detail (Plex: upload + diff + select with content-addressed dedup;
   * Jellyfin: atomic single-call replace).
   */
  uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
    mode?: OverlayTemplateMode,
  ): Promise<void>;
}
