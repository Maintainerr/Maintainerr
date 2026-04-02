import { MediaServerType } from '@maintainerr/contracts';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';

const hoursInOneDay = 24;
const minutesInOneHour = 60;
const secondsInOneMinute = 60;
const millisecondsInOneSecond = 1000;
// same as 86400000 (we have the magic number in the collection-worker.service.ts file when calculating dangerDate. worth replacing with a constant?) maybe just millisecondsInADay = 86400000 ?
const millisecondsInADay =
  millisecondsInOneSecond *
  secondsInOneMinute *
  minutesInOneHour *
  hoursInOneDay;

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
    collectionGroup.mediaToHandle.forEach((media) => {
      handleMediaOverlay(
        media,
        collectionGroup.collection.deleteAfterDays,
        collectionGroup.collection.mediaServerType,
      );
    });
  });
}
function handleMediaOverlay(
  media: CollectionMedia,
  deleteAfterDays: number,
  mediaServerType: MediaServerType,
) {
  const dangerDate = new Date(
    new Date().getTime() - deleteAfterDays * millisecondsInADay,
  );
  const daysRemaining = Math.floor(
    (media.addDate.getTime() - dangerDate.getTime()) / millisecondsInADay,
  );

  const originalPoster = getAndSavePoster(media, mediaServerType);
  const modifiedPoster = modifyPoster(originalPoster, daysRemaining);
  const result = putPoster(modifiedPoster, mediaServerType);
  // todo. decide on what this should be
  if (result === 'good') {
    //log everything
  }
}

// TODO: should we also delete posters from local storage when an item is deleted? if so: that needs to be added in the collection-worker.service file roughly on line 154 (where it deletes the media from the mediaServer)
// should possibly also split posters based on the media item type? (movie, show, season, episode)
function getAndSavePoster(
  media: CollectionMedia,
  mediaServerType: MediaServerType,
) {
  let originalPoster = getOriginalPosterFromLocalStorage(media);
  if (originalPoster) return originalPoster;

  if (mediaServerType === MediaServerType.JELLYFIN) {
    // get poster from jellyfin
  } else if (mediaServerType === MediaServerType.PLEX) {
    // get poster from plex
  }
  // save poster locally in a safe area (config/posters/originalPoster?) using the media.id as a name

  return originalPoster;
}
// modifiedPoster should be an image type, but this is a draft
function putPoster(modifiedPoster: any, mediaServerType: MediaServerType) {
  if (mediaServerType === MediaServerType.JELLYFIN) {
    // put poster back in jellyfin
  } else if (mediaServerType === MediaServerType.PLEX) {
    // put poster back on plex
  }
  // TODO: this should probably be an error message, and then we return the response from jellyfin/plex in their if-statements above
  return 'good';
}
// this should add an overlay to the poster using daysRemaining. possibly using canvas? example project: https://github.com/agustinustheo/sharp-canvas-ts
function modifyPoster(originalPoster, daysRemaining: number) {
  return originalPoster;
}
function getOriginalPosterFromLocalStorage(media: CollectionMedia) {
  //read from config/posters/originalPoster using the media id as the name of the item?
  throw new Error('Function not implemented.');
}
