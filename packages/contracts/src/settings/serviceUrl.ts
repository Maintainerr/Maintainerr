import z from 'zod'

/**
 * Canonical tail form of a service URL. Manual char walk rather than a regex,
 * per the project's string-handling convention.
 */
export function stripTrailingSlashes(value: string): string {
  let endIndex = value.length

  while (endIndex > 0 && value[endIndex - 1] === '/') {
    endIndex -= 1
  }

  return endIndex === value.length ? value : value.slice(0, endIndex)
}

/**
 * Shared Zod schema for service URL fields.
 *
 * Trailing slashes are normalised away rather than rejected: every client
 * appends its own '/path', and storing one canonical form keeps them from
 * producing '//path'. Stripping before the scheme check is what keeps a bare
 * 'http://' an error instead of a silently mangled 'http:'. `overwrite` rather
 * than `transform` because it is a check, so the schema stays a `ZodString`
 * and every `z.infer`'d DTO keeps its field required.
 *
 * Only http:// and https:// are accepted (rejects file://, gopher://, ftp://,
 * etc.).
 *
 * Note: This is input sanitization, not full SSRF protection. Maintainerr is a
 * self-hosted application that intentionally connects to user-configured services
 * on private networks (localhost, RFC1918 ranges, etc.), so blocking private IPs
 * is not viable. Access to settings endpoints should be restricted at the network
 * level (reverse proxy, firewall) as the application has no built-in authentication.
 */
export const serviceUrlSchema = z
  .string()
  .trim()
  .overwrite(stripTrailingSlashes)
  .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
    message: 'Must start with http:// or https://',
  })
