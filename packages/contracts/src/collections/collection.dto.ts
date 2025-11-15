import { createZodDto } from 'nestjs-zod/dto'
import { z } from 'zod'
import { collectionSchema } from './collection'
import { collectionMediaSchema } from './collectionMedia'

export class CollectionDto extends createZodDto(collectionSchema) {}

export class CollectionWithMediaDto extends createZodDto(
  collectionSchema.extend({
    media: z.array(collectionMediaSchema),
  }),
) {}
