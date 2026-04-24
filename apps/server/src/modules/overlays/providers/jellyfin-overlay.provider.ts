import {
  ImageType,
  BaseItemKind,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  OverlayLibrarySection,
  OverlayPreviewItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { JellyfinAdapterService } from '../../api/media-server/jellyfin/jellyfin-adapter.service';
import { IOverlayProvider } from './overlay-provider.interface';

/**
 * Jellyfin implementation of IOverlayProvider.
 *
 * Maps overlay modes to Jellyfin's `ImageType` — poster → Primary,
 * titlecard → Thumb. This is the single place that bridges the two
 * taxonomies, so JellyfinAdapterService stays SDK-generic (it accepts
 * any ImageType) and the overlay module stays mode-generic (it only
 * knows about OverlayTemplateMode).
 */
@Injectable()
export class JellyfinOverlayProvider implements IOverlayProvider {
  constructor(private readonly jf: JellyfinAdapterService) {}

  private imageTypeFor(): ImageType {
    return ImageType.Primary;
  }

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
    const title = ep.SeriesName ? `${ep.SeriesName} — ${name}` : name;
    return { itemId: ep.Id, title };
  }

  async downloadImage(itemId: string): Promise<Buffer | null> {
    return this.jf.getItemImageBuffer(itemId, this.imageTypeFor());
  }

  async uploadImage(
    itemId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.jf.setItemImage(
      itemId,
      this.imageTypeFor(),
      buffer,
      contentType,
    );
  }
}
