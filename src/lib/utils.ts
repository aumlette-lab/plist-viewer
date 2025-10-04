export type FlattenedRow = { key: string; value: string };

export type ComparisonStatus = "same" | "different" | "missing-in-a" | "missing-in-b";

export type ComparisonRow = {
  key: string;
  valueA: string | null;
  valueB: string | null;
  status: ComparisonStatus;
};

type KeyedArchive = {
  $objects?: unknown[];
  $top?: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPathSegment(key: string | number): string {
  return typeof key === "number" ? `[${key}]` : String(key);
}

function joinPath(prefix: string, segment: string): string {
  if (!prefix) return segment;
  return segment.startsWith("[") ? `${prefix}${segment}` : `${prefix}.${segment}`;
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function flattenGeneric(input: unknown, prefix = ""): FlattenedRow[] {
  const rows: FlattenedRow[] = [];

  if (Array.isArray(input)) {
    input.forEach((val, index) => {
      const key = joinPath(prefix, toPathSegment(index));
      if (val !== null && typeof val === "object") {
        rows.push(...flattenGeneric(val, key));
      } else {
        rows.push({ key, value: formatValue(val) });
      }
    });

    const extras = Object.entries(input).filter(([rawKey]) => {
      return Number.isNaN(Number(rawKey));
    });

    for (const [extraKey, extraVal] of extras) {
      const key = joinPath(prefix, toPathSegment(extraKey));
      if (extraVal !== null && typeof extraVal === "object") {
        rows.push(...flattenGeneric(extraVal, key));
      } else {
        rows.push({ key, value: formatValue(extraVal) });
      }
    }

    return rows;
  }

  if (isPlainObject(input)) {
    const entries = Object.entries(input);
    if (entries.length === 0 && prefix) {
      rows.push({ key: prefix, value: "{}" });
      return rows;
    }
    for (const [k, val] of entries) {
      const key = joinPath(prefix, toPathSegment(k));
      if (val !== null && typeof val === "object") {
        rows.push(...flattenGeneric(val, key));
      } else {
        rows.push({ key, value: formatValue(val) });
      }
    }
    return rows;
  }

  rows.push({ key: prefix || "(root)", value: formatValue(input) });
  return rows;
}

function isUidReference(value: unknown): value is { CF$UID: number } {
  if (!isPlainObject(value)) return false;
  if (!("CF$UID" in value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && typeof (value as { CF$UID: unknown }).CF$UID === "number";
}

function isUidWrapper(value: unknown): value is { UID: number } {
  if (!isPlainObject(value)) return false;
  if (!("UID" in value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && typeof (value as { UID: unknown }).UID === "number";
}

function isKeyedArchive(value: unknown): value is KeyedArchive {
  return (
    isPlainObject(value) &&
    Array.isArray((value as KeyedArchive).$objects) &&
    isPlainObject((value as KeyedArchive).$top)
  );
}

function resolveArchiveTop(archive: KeyedArchive): Record<string, unknown> {
  const objects = Array.isArray(archive.$objects) ? archive.$objects : [];
  const cache = new Map<number, unknown>();

  const topEntries = archive.$top ? Object.entries(archive.$top) : [];
  return Object.fromEntries(
    topEntries.map(([key, value]) => [key, resolveValue(value, new Set<number>())])
  );

  function resolveUid(uid: number, stack: Set<number>): unknown {
    if (cache.has(uid)) return cache.get(uid);
    if (stack.has(uid)) {
      return `[Circular CF$UID ${uid}]`;
    }
    stack.add(uid);
    const raw = objects[uid];
    let resolved: unknown;
    if (raw === "$null" || raw === null || raw === undefined) {
      resolved = null;
    } else if (Array.isArray(raw)) {
      resolved = raw.map(item => resolveValue(item, stack));
    } else if (isPlainObject(raw)) {
      resolved = decodeObject(raw, stack);
    } else {
      resolved = raw;
    }
    cache.set(uid, resolved);
    stack.delete(uid);
    return resolved;
  }

  function resolveValue(value: unknown, stack: Set<number>): unknown {
    if (isUidReference(value)) {
      return resolveUid(value.CF$UID, stack);
    }
    if (isUidWrapper(value)) {
      return resolveUid(value.UID, stack);
    }
    if (Array.isArray(value)) {
      return value.map(item => resolveValue(item, stack));
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, resolveValue(v, stack)])
      );
    }
    return value;
  }

  function decodeObject(raw: Record<string, unknown>, stack: Set<number>): unknown {
    const classRef = raw["$class"];
    const className = isUidReference(classRef)
      ? extractClassName(resolveUid(classRef.CF$UID, stack))
      : null;

    if (className && isDictionaryClass(className)) {
      const keys = Array.isArray(raw["NS.keys"]) ? raw["NS.keys"] : [];
      const values = Array.isArray(raw["NS.objects"]) ? raw["NS.objects"] : [];
      const result: Record<string, unknown> = {};
      const length = Math.min(keys.length, values.length);
      const seenCounts = new Map<string, number>();
      for (let index = 0; index < length; index += 1) {
        const resolvedKey = resolveValue(keys[index], stack);
        const resolvedValue = resolveValue(values[index], stack);
        const dictKey = formatDictionaryKey(resolvedKey);
        const occurrence = seenCounts.get(dictKey) ?? 0;
        seenCounts.set(dictKey, occurrence + 1);
        if (occurrence === 0) {
          result[dictKey] = resolvedValue;
        } else {
          result[`${dictKey}#${occurrence}`] = resolvedValue;
        }
      }
      if (className) {
        result["$class"] = className;
      }
      return result;
    }

    if (className && isArrayLikeClass(className)) {
      const items = Array.isArray(raw["NS.objects"]) ? raw["NS.objects"] : [];
      const resolvedItems = items.map(item => resolveValue(item, stack));
      if (className) {
        Object.defineProperty(resolvedItems, "$class", {
          value: className,
          writable: false,
          enumerable: true,
        });
      }
      return resolvedItems;
    }

    if (className === "NSNumber") {
      const decodedNumber = decodeNSNumber(raw);
      if (decodedNumber !== null) return decodedNumber;
    }

    if (className === "NSDate") {
      const decodedDate = decodeNSDate(raw);
      if (decodedDate !== null) return decodedDate;
    }

    const entries = Object.entries(raw)
      .filter(([key]) => key !== "$class")
      .map(([key, value]) => [key, resolveValue(value, stack)] as const);
    const result = Object.fromEntries(entries);
    if (className) {
      (result as Record<string, unknown>)["$class"] = className;
    }
    return result;
  }

  function extractClassName(input: unknown): string | null {
    if (typeof input === "string") return input;
    if (isPlainObject(input) && typeof input.$classname === "string") {
      return input.$classname;
    }
    return null;
  }

  function isDictionaryClass(name: string): boolean {
    return name === "NSDictionary" || name === "NSMutableDictionary";
  }

  function isArrayLikeClass(name: string): boolean {
    return (
      name === "NSArray" ||
      name === "NSMutableArray" ||
      name === "NSSet" ||
      name === "NSMutableSet"
    );
  }

  function formatDictionaryKey(key: unknown): string {
    if (typeof key === "string") return key;
    if (typeof key === "number" || typeof key === "boolean") {
      return String(key);
    }
    return formatValue(key);
  }

  function decodeNSNumber(raw: Record<string, unknown>): number | boolean | null {
    if ("NS.bool" in raw) {
      const value = raw["NS.bool"];
      if (typeof value === "string") {
        return value === "Y" || value === "true";
      }
      if (typeof value === "number") {
        return value !== 0;
      }
    }
    if ("NS.integer" in raw) {
      const parsed = Number(raw["NS.integer"]);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if ("NS.double" in raw) {
      const parsed = Number(raw["NS.double"]);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if ("NS.decimal" in raw && isPlainObject(raw["NS.decimal"])) {
      const decimal = raw["NS.decimal"] as Record<string, unknown>;
      if (typeof decimal._mantissa === "number" && typeof decimal._exponent === "number") {
        return decimal._mantissa * Math.pow(10, decimal._exponent);
      }
    }
    return null;
  }

  function decodeNSDate(raw: Record<string, unknown>): string | null {
    if ("NS.time" in raw) {
      const seconds = Number(raw["NS.time"]);
      if (!Number.isNaN(seconds)) {
        const epoch = new Date(seconds * 1000 + Date.UTC(2001, 0, 1));
        return epoch.toISOString();
      }
    }
    return null;
  }
}

function flattenKeyedArchive(archive: KeyedArchive): FlattenedRow[] {
  const rows: FlattenedRow[] = [];
  const resolvedTop = resolveArchiveTop(archive);
  rows.push(...flattenGeneric(resolvedTop, "$top"));

  const metadataEntries = Object.entries(archive).filter(([key]) => key !== "$top" && key !== "$objects");
  if (metadataEntries.length) {
    const metadata = Object.fromEntries(metadataEntries);
    rows.push(...flattenGeneric(metadata));
  }

  return rows;
}

export function flattenObject(input: unknown, prefix = ""): FlattenedRow[] {
  if (!prefix && isKeyedArchive(input)) {
    return flattenKeyedArchive(input);
  }
  return flattenGeneric(input, prefix);
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
