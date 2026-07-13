// The types are split up so future additions to specific events will be easier

import { MediaItem } from '@maintainerr/contracts';

export interface NotificationMediaItem {
  mediaServerId: string;
  // Snapshot taken before the item was handled: a delete removes it from the
  // media server, so the notification can't look its title up afterwards (#3249).
  metadata?: MediaItem;
}

export class RuleHandlerFailedDto {
  constructor(
    public collectionName?: string,
    public identifier?: { type: string; value: number },
  ) {}
}

export class CollectionMediaHandledDto {
  constructor(
    public mediaItems: NotificationMediaItem[],
    public collectionName: string,
    public identifier?: { type: string; value: number },
  ) {}
}

export class CollectionMediaRemovedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier: { type: string; value: number },
    public collectionId: number,
    public dayAmount?: number,
  ) {}
}

export class CollectionMediaAddedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier: { type: string; value: number },
    public collectionId: number,
    public dayAmount?: number,
  ) {}
}

export class CollectionHandlerFailedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName?: string,
    public dayAmount?: number,
    public identifier?: { type: string; value: number },
  ) {}
}

export class OverlayAppliedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier?: { type: string; value: number },
  ) {}
}

export class OverlayRevertedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier?: { type: string; value: number },
  ) {}
}
