/** Split array into fixed-size chunks for batched `.in()` queries (URL / PostgREST limits). */
export function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const safe = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += safe) {
    chunks.push(arr.slice(i, i + safe));
  }
  return chunks;
}
