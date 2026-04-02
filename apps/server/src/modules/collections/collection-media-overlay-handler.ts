import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';

const millisecondsInADay = 1000 * 60 * 60 * 24;

export function handleMediaCollectionOverlay(
  collectionPosterOverlayMediaGroup: {
    collection: Collection;
    mediaToHandle: CollectionMedia[];
  }[],
) {
  const collectionsToHandle = collectionPosterOverlayMediaGroup.filter(
    (collectionGroup) => collectionGroup.collection.addRemainingDaysOverlay,
  );
  collectionsToHandle.forEach((collectionGroup) => {
    const dangerDate = new Date(
      new Date().getTime() -
        +collectionGroup.collection.deleteAfterDays * 86400000,
    );
    collectionGroup.mediaToHandle.forEach((media) => {
      const daysRemaining = Math.floor(
        (media.addDate.getTime() - dangerDate.getTime()) / millisecondsInADay,
      );
    });
  });
}
