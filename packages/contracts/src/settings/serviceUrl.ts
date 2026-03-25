import z from 'zod'

/**
 * Shared Zod refinement for service URL fields.
 *
 * Enforces:
 * - http:// or https:// scheme only (rejects file://, gopher://, ftp://, etc.)
 * - No trailing slash (consistent URL storage)
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
  .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
    message: 'Must start with http:// or https://',
  })
  .refine((val) => !val.endsWith('/'), {
    message: "Must not end with a '/'",
  })
