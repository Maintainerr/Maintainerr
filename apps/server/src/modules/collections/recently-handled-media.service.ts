import { MaintainerrEvent } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Tracks the mediaServerIds the collection handler has processed for each
 * collection so the rule executor can suppress an immediate re-add on its
 * next pass.
 *
 * The collection handler runs an arr/Plex/Jellyfin action and removes the
 * item from the collection. The rule executor then re-evaluates the same
 * conditions seconds later. Conditions like "watched at all" or
 * "lastViewedAt before N days" stay true after the action, so the item is
 * re-added and a `Media Added` notification fires — confusing users who
 * just received a `Media Removed` event for the same title.
 *
 * State is in-memory and per-collection. Both the scheduled handler and
 * the manual `POST /media/handle` endpoint funnel through
 * `CollectionHandler.handleMedia`, so a single mark-on-success call there
 * keeps every code path consistent.
 *
 * A process restart wipes the state, so one re-add/notification can slip
 * through after a restart until the handler runs again — acceptable.
 * Entries are removed when the collection itself is deleted; otherwise
 * they live until they're queried again, which keeps the structure
 * trivially bounded by active collection size.
 */
@Injectable()
export class RecentlyHandledMediaService {
  private readonly handledByCollection = new Map<number, Set<string>>();

  markHandled(collectionId: number, mediaServerId: string): void {
    let set = this.handledByCollection.get(collectionId);
    if (!set) {
      set = new Set();
      this.handledByCollection.set(collectionId, set);
    }
    set.add(mediaServerId);
  }

  wasRecentlyHandled(collectionId: number, mediaServerId: string): boolean {
    return (
      this.handledByCollection.get(collectionId)?.has(mediaServerId) ?? false
    );
  }

  clearForCollection(collectionId: number): void {
    this.handledByCollection.delete(collectionId);
  }

  @OnEvent(MaintainerrEvent.Collection_Deleted)
  private onCollectionDeleted(payload: { collection: { id: number } }) {
    if (payload?.collection?.id !== undefined) {
      this.clearForCollection(payload.collection.id);
    }
  }
}
