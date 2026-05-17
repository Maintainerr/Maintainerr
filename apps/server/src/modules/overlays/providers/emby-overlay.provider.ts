import {
  OverlayLibrarySection,
  OverlayPreviewItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EmbyAdapterService } from '../../api/media-server/emby/emby-adapter.service';
import { IOverlayProvider } from './overlay-provider.interface';

/**
 * Emby implementation of IOverlayProvider.
 *
 * Reads/writes the `Primary` image (poster for movies/shows, still for
 * episodes), mirroring the Jellyfin provider's choice. Emby's image endpoint
 * surface matches Jellyfin's (same .NET ancestor): GET/POST/DELETE
 * /Items/{id}/Images/{imageType}.
 *
 * Random-item helpers depend on `EmbyAdapterService.findRandomItem` /
 * `findRandomEpisode`, which are intentionally not implemented in this PR.
 * Until those land, getRandomItem/getRandomEpisode return null so the overlay
 * UI degrades gracefully (no preview, no error).
 */
@Injectable()
export class EmbyOverlayProvider implements IOverlayProvider {
  constructor(private readonly emby: EmbyAdapterService) {}

  async isAvailable(): Promise<boolean> {
    return this.emby.isSetup();
  }

  async getSections(): Promise<OverlayLibrarySection[]> {
    const libs = await this.emby.getLibraries();
    const sections: OverlayLibrarySection[] = [];
    for (const l of libs) {
      if (l.type === 'movie' || l.type === 'show') {
        sections.push({ key: l.id, title: l.title, type: l.type });
      }
    }
    return sections;
  }

  async getRandomItem(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    void sectionKeys;
    // TODO(emby-server-test): port Jellyfin's findRandomItem helper —
    // /Items?Recursive&IncludeItemTypes=Movie,Series&SortBy=Random&Limit=1
    return null;
  }

  async getRandomEpisode(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    void sectionKeys;
    // TODO(emby-server-test): /Items?Recursive&IncludeItemTypes=Episode&SortBy=Random&Limit=1
    return null;
  }

  async downloadImage(itemId: string): Promise<Buffer | null> {
    void itemId;
    // TODO(emby-server-test): GET /Items/{id}/Images/Primary returns binary
    return null;
  }

  async uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    // Reuse the collection-image upload path: Emby's image upload endpoint
    // accepts a base64 body with the original Content-Type on POST.
    await this.emby.setCollectionImage(itemId, buffer, contentType);
  }

  async itemExists(itemId: string): Promise<boolean> {
    const meta = await this.emby.getMetadata(itemId);
    return meta !== undefined;
  }
}
