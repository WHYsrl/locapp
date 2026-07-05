const toSnake = (key: string): string => key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Serializes a drizzle row to the API shape: snake_case keys, ISO dates, no raw geometry/vector. */
export function rowToApi(
  row: Record<string, unknown>,
  exclude: string[] = ['geom', 'embedding'],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (exclude.includes(key)) continue;
    out[toSnake(key)] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export function rowsToApi(rows: Array<Record<string, unknown>>, exclude?: string[]) {
  return rows.map((r) => rowToApi(r, exclude));
}
