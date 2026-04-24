import {
  OverlayLibrarySection,
  OverlayPreviewItem,
  OverlayTemplateMode,
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
 *
 * `mode` is accepted for interface uniformity but intentionally ignored: on
 * Plex, the item's own `thumb` is always the correct artwork. Movies and
 * shows use their poster `thumb`; episodes use their title-card `thumb`.
 * Jellyfin splits these onto different image kinds — Plex does not.
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

  async downloadImage(
    itemId: string,
    mode: OverlayTemplateMode,
  ): Promise<Buffer | null> {
    // Plex keeps both poster and title-card artwork on the item's own `thumb`,
    // so there's nothing to branch on — but the parameter stays for interface
    // uniformity with JellyfinOverlayProvider.
    void mode;
    const thumb = await this.plex.getBestPosterUrl(itemId);
    if (!thumb) return null;
    return this.plex.downloadPoster(thumb);
  }

  async uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
     mode: OverlayTemplateMode,
  ): Promise<void> {
    void mode;
    await this.plex.setThumb(itemId, buffer, contentType);
  }
}
