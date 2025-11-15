import z from 'zod'

export const jellyseerrSettingSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'Must start with http:// or https://',
    })
    .refine((val) => !val.endsWith('/'), {
      message: "Must not end with a '/'",
    }),
  api_key: z.string().trim(),
})
