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
    const item = await this.emby.findRandomItem(sectionKeys, [
      'Movie',
      'Series',
    ]);
    if (!item?.Id) return null;
    return { itemId: item.Id, title: item.Name ?? '' };
  }

  async getRandomEpisode(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    const ep = await this.emby.findRandomEpisode(sectionKeys);
    if (!ep?.Id) return null;
    const name = ep.Name ?? '';
    const title = ep.SeriesName ? `${ep.SeriesName} — ${name}` : name;
    return { itemId: ep.Id, title };
  }

  async downloadImage(itemId: string): Promise<Buffer | null> {
    return this.emby.getItemImageBuffer(itemId, 'Primary');
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
    return this.emby.itemExists(itemId);
  }
}
