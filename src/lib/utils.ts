export type FlattenedRow = { key: string; value: string };

export function flattenObject(input: any, prefix = ""): FlattenedRow[] {
  const rows: FlattenedRow[] = [];
  const makeKey = (k: string | number) => (prefix ? `${prefix}.${k}` : String(k));
  if (Array.isArray(input)) {
    input.forEach((val, i) => {
      const key = makeKey(`[${i}]`);
      if (val !== null && typeof val === "object") {
        rows.push(...flattenObject(val, key));
      } else {
        rows.push({ key, value: String(val) });
      }
    });
  } else if (input !== null && typeof input === "object") {
    for (const [k, val] of Object.entries(input)) {
      const key = makeKey(k);
      if (val !== null && typeof val === "object") {
        rows.push(...flattenObject(val as any, key));
      } else {
        rows.push({ key, value: String(val) });
      }
    }
  } else {
    rows.push({ key: prefix || "(root)", value: String(input) });
  }
  return rows;
}
