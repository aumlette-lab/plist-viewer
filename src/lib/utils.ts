export type FlattenedRow = { key: string; value: string };

export type ComparisonStatus = "same" | "different" | "missing-in-a" | "missing-in-b";

export type ComparisonRow = {
  key: string;
  valueA: string | null;
  valueB: string | null;
  status: ComparisonStatus;
};

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

export function buildComparisonRows(a: FlattenedRow[], b: FlattenedRow[]): ComparisonRow[] {
  const mapA = new Map(a.map(row => [row.key, row.value]));
  const mapB = new Map(b.map(row => [row.key, row.value]));
  const keys = new Set<string>([...mapA.keys(), ...mapB.keys()]);
  const sortedKeys = Array.from(keys).sort((left, right) => left.localeCompare(right));

  return sortedKeys.map(key => {
    const valueA = mapA.get(key) ?? null;
    const valueB = mapB.get(key) ?? null;

    let status: ComparisonStatus;
    if (valueA === null) {
      status = "missing-in-a";
    } else if (valueB === null) {
      status = "missing-in-b";
    } else if (valueA === valueB) {
      status = "same";
    } else {
      status = "different";
    }

    return { key, valueA, valueB, status };
  });
}
