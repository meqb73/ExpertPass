/**
 * Human-readable messages a wallet signs to authorise offchain actions.
 * Shared by the browser (signing) and the server (verification), so both sides always agree.
 */

export const avatarSetMessage = (b: { chainId: number; contract: string; address: string; issuedAt: number; sha256: string }) =>
  [
    'ExpertPass: set avatar',
    `Chain: ${b.chainId}`,
    `Contract: ${b.contract.toLowerCase()}`,
    `Address: ${b.address.toLowerCase()}`,
    `Issued: ${b.issuedAt}`,
    `Sha256: ${b.sha256}`,
  ].join('\n')

export const MAX_AVATAR_BYTES = 512 * 1024

/** Signed messages are accepted for this long. */
export const MESSAGE_TTL_SECONDS = 10 * 60

export const MAX_LINK_LENGTH = 500

export function isValidEventLink(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LINK_LENGTH) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Cover image links must be public https URLs, at most 512 bytes (same rule the contract enforces). */
export function isValidCoverUrl(value: string): boolean {
  if (new TextEncoder().encode(value).length > 512 || !value.startsWith('https://')) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
