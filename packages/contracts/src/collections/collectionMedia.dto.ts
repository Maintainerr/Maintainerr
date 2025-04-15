import { createZodDto } from 'nestjs-zod'
import {
  collectionMediaSchema,
  collectionMediaWithCollectionSchema,
  collectionMediaWithPlexDataSchema,
} from './collectionMedia'

export class CollectionMediaDto extends createZodDto(collectionMediaSchema) {}

export class CollectionMediaWithCollectionDto extends createZodDto(
  collectionMediaWithCollectionSchema,
) {}

export class CollectionMediaWithPlexDataDto extends createZodDto(
  collectionMediaWithPlexDataSchema,
) {}
