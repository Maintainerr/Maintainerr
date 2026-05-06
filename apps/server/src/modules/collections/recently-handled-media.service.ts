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
 * Lifecycle:
 *  - `CollectionHandler.handleMedia` calls `markHandled` after each
 *    successful action. Both the scheduled worker and the manual
 *    `POST /media/handle` endpoint funnel through that single call site.
 *  - `RuleExecutorService.handleCollection` calls `wasRecentlyHandled`
 *    while building its add list, then calls `clearForCollection` once
 *    that decision has been made. The suppression therefore blocks
 *    exactly the immediate echo and disappears for the pass after.
 *  - `Collection_Deleted` clears any leftover marks for the collection.
 *
 * State is in-memory and per-collection. A process restart wipes it, so
 * one re-add/notification can slip through after a restart until the
 * handler runs again — acceptable. Because the rule executor consumes
 * each collection's marks on its next pass, the structure stays bounded
 * by what the handler produces between two consecutive rule passes.
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
