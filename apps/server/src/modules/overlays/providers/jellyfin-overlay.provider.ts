import {
  ImageType,
  BaseItemKind,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  OverlayLibrarySection,
  OverlayPreviewItem,
  OverlayTemplateMode,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { JellyfinAdapterService } from '../../api/media-server/jellyfin/jellyfin-adapter.service';
import { IOverlayProvider } from './overlay-provider.interface';

/**
 * Jellyfin implementation of IOverlayProvider.
 *
 * Reads/writes only the `Primary` image: movies and shows have their poster
 * there, and episodes have their still there (Jellyfin's `Thumb` is mostly
 * unpopulated for episodes and shows a 16:9 series banner for
 * continue-watching fallback - neither is what an overlay should target).
 */
@Injectable()
export class JellyfinOverlayProvider implements IOverlayProvider {
  constructor(private readonly jf: JellyfinAdapterService) {}

  async isAvailable(): Promise<boolean> {
    return this.jf.isSetup();
  }

  async getSections(): Promise<OverlayLibrarySection[]> {
    const libs = await this.jf.getLibraries();
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
    const item = await this.jf.findRandomItem(sectionKeys, [
      BaseItemKind.Movie,
      BaseItemKind.Series,
    ]);
    if (!item?.Id) return null;
    return { itemId: item.Id, title: item.Name ?? '' };
  }

  async getRandomEpisode(
    sectionKeys?: string[],
  ): Promise<OverlayPreviewItem | null> {
    const ep = await this.jf.findRandomEpisode(sectionKeys);
    if (!ep?.Id) return null;
    const name = ep.Name ?? '';
    const title = ep.SeriesName ? `${ep.SeriesName} - ${name}` : name;
    return { itemId: ep.Id, title };
  }

  async downloadImage(itemId: string, mode: OverlayTemplateMode = 'poster'): Promise<Buffer | null> {
    if (mode !== 'backdrop') {
      return this.jf.getItemImageBuffer(itemId, ImageType.Primary);
    }
    // Seasons and some Jellyfin libraries have no Backdrop image. Thumb is
    // the landscape artwork used by Infuse for those items; Primary is the
    // final fallback so the configured overlay is still applied.
    return (
      (await this.jf.getItemImageBuffer(itemId, ImageType.Backdrop)) ??
      (await this.jf.getItemImageBuffer(itemId, ImageType.Thumb)) ??
      (await this.jf.getItemImageBuffer(itemId, ImageType.Primary))
    );
  }

  async uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
    mode: OverlayTemplateMode = 'poster',
  ): Promise<void> {
    if (mode === 'poster' || mode === 'titlecard') {
      await this.jf.setItemImage(itemId, ImageType.Primary, buffer, contentType);
    } else {
      await this.jf.setOverlayImage(itemId, mode, buffer, contentType);
    }
  }
}
