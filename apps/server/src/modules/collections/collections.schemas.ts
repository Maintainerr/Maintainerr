import { MediaServerType, ServarrAction } from '@maintainerr/contracts';
import { z } from 'zod';

const mediaItemTypeSchema = z.enum(['movie', 'show', 'season', 'episode']);

const addRemoveCollectionMediaSchema = z.object({
  mediaServerId: z.string().min(1),
  reason: z.unknown().optional(),
});

const collectionSchema = z.object({
  id: z.number().int().positive().optional(),
  type: mediaItemTypeSchema,
  mediaServerId: z.string().min(1).nullable().optional(),
  mediaServerType: z.nativeEnum(MediaServerType).nullable().optional(),
  libraryId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean(),
  arrAction: z.nativeEnum(ServarrAction),
  visibleOnRecommended: z.boolean().optional(),
  visibleOnHome: z.boolean().optional(),
  listExclusions: z.boolean().optional(),
  forceSeerr: z.boolean().optional(),
  deleteAfterDays: z.number().int().nonnegative().optional(),
  manualCollection: z.boolean().optional(),
  manualCollectionName: z.string().optional(),
  keepLogsForMonths: z.number().int().nonnegative().optional(),
  tautulliWatchedPercentOverride: z.number().int().nonnegative().optional(),
  radarrSettingsId: z.number().int().positive().optional(),
  sonarrSettingsId: z.number().int().positive().optional(),
  sortTitle: z.string().optional(),
});

export const createCollectionRequestSchema = z.object({
  collection: collectionSchema,
  media: z.array(addRemoveCollectionMediaSchema).optional(),
});

export const addToCollectionRequestSchema = z.object({
  collectionId: z.number().int().positive(),
  media: z.array(addRemoveCollectionMediaSchema),
  manual: z.boolean().optional(),
});

export const removeFromCollectionRequestSchema = z.object({
  collectionId: z.number().int().positive(),
  media: z.array(addRemoveCollectionMediaSchema),
});

export const removeCollectionRequestSchema = z.object({
  collectionId: z.number().int().positive(),
});

export const updateCollectionRequestSchema = collectionSchema.extend({
  id: z.number().int().positive(),
});
