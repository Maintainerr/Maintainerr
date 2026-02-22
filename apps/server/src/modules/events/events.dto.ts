// The types are split up so future additions to specific events will be easier

export class RuleHandlerFailedDto {
  constructor(
    public collectionName?: string,
    public identifier?: { type: string; value: number },
  ) {}
}

export class CollectionMediaHandledDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier?: { type: string; value: number },
  ) {}
}

export class CollectionMediaRemovedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier: { type: string; value: number },
    public dayAmount?: number,
  ) {}
}

export class CollectionMediaAddedDto {
  constructor(
    public mediaItems: { mediaServerId: string }[],
    public collectionName: string,
    public identifier: { type: string; value: number },
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
