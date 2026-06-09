/**
 * Bucket allow-list for orphan scan UI + API. Keep this module free of imports that
 * pull Node built-ins — client components may import it.
 */
export const STORAGE_ORPHAN_BUCKET_IDS = [
  "ticket-images",
  "ticket-qr",
  "event-images",
  "event-banners",
  "ticket-templates",
  "seat-map-images",
] as const;

export type StorageOrphanBucketId = (typeof STORAGE_ORPHAN_BUCKET_IDS)[number];

export function isStorageOrphanBucketId(s: string): s is StorageOrphanBucketId {
  return (STORAGE_ORPHAN_BUCKET_IDS as readonly string[]).includes(s);
}
