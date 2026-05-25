export function normalizeImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return null;

  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  return trimmed;
}
