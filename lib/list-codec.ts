export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseUniqueList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const entry of parseList(value)) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(entry);
  }

  return items;
}

export function encodeList(values: string[]): string {
  return values
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(", ");
}

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}
