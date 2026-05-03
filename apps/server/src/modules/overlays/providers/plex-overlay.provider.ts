import {
  OverlayLibrarySection,
  OverlayPreviewItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { IOverlayProvider } from './overlay-provider.interface';

/**
 * Plex implementation of IOverlayProvider.
 *
 * Pure delegation over existing PlexApiService helpers — every Plex-specific
 * concept (`thumb` URL, `upload://posters/` URI scheme, X-Plex-Token,
 * type=4 episode filter, content-addressed dedup, eventual-consistency
 * retry loop) stays inside PlexApiService. This class adds no Plex logic.
 */
@Injectable()
export class PlexOverlayProvider implements IOverlayProvider {
  constructor(private readonly plex: PlexApiService) {}

  async isAvailable(): Promise<boolean> {
    return this.plex.isPlexSetup();
  }

  async getSections(): Promise<OverlayLibrarySection[]> {
    const raw = await this.plex.getOverlayLibrarySections();
    const sections: OverlayLibrarySection[] = [];
    for (const s of raw) {
      if (s.type === 'movie' || s.type === 'show') {
        sections.push({ key: s.key, title: s.title, type: s.type });
      }
    }
    return sections;
  }

  async getRandomItem(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    const r = await this.plex.getRandomLibraryItem(sectionKeys);
    return r ? { itemId: r.plexId, title: r.title } : null;
  }

  async getRandomEpisode(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    const r = await this.plex.getRandomEpisodeItem(sectionKeys);
    return r ? { itemId: r.plexId, title: r.title } : null;
  }

  async downloadImage(itemId: string): Promise<Buffer | null> {
    const thumb = await this.plex.getBestPosterUrl(itemId);
    if (!thumb) return null;
    return this.plex.downloadPoster(thumb);
  }

  async uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.plex.setThumb(itemId, buffer, contentType);
  }

  async itemExists(itemId: string): Promise<boolean> {
    return this.plex.itemExists(itemId);
  }
}
