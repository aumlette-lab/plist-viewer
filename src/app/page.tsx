"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildComparisonRows,
  flattenObject,
  type ComparisonStatus,
  type FlattenedRow,
} from "@/lib/utils";
import { exportCSV, exportXLSX, type ExportRow } from "@/lib/export-xlsx";

type SlotKey = "a" | "b";
type ViewMode = "a" | "b" | "compare";
type SortKey = "key" | "valueA" | "valueB" | "status";
type Sort = { key: SortKey; dir: "asc" | "desc" };

type FileSlotState = {
  name: string | null;
  sizeLabel: string | null;
  rows: FlattenedRow[];
  loading: boolean;
  error: string | null;
};

type SlotsState = { a: FileSlotState; b: FileSlotState };

type DisplayRow = {
  key: string;
  valueA: string | null;
  valueB: string | null;
  status: ComparisonStatus | null;
};

const ALLOWED_SORT_KEYS: Record<ViewMode, SortKey[]> = {
  a: ["key", "valueA"],
  b: ["key", "valueB"],
  compare: ["key", "valueA", "valueB", "status"],
};

const STATUS_LABELS: Record<ComparisonStatus, string> = {
  same: "same",
  different: "different",
  "missing-in-a": "missing in A",
  "missing-in-b": "missing in B",
};

const STATUS_STYLES: Record<ComparisonStatus, string> = {
  same: "bg-emerald-100 text-emerald-700",
  different: "bg-amber-100 text-amber-700",
  "missing-in-a": "bg-rose-100 text-rose-700",
  "missing-in-b": "bg-indigo-100 text-indigo-700",
};

function createEmptySlot(): FileSlotState {
  return { name: null, sizeLabel: null, rows: [], loading: false, error: null };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = unit === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unit]}`;
}

function toSafeFileStem(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "plist-export";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "-");
}

function toSheetName(input: string): string {
  const cleaned = input.replace(/[\\/?*\[\]]+/g, "").trim();
  if (!cleaned) return "plist";
  return cleaned.slice(0, 31);
}

function mapToDisplayRow(row: FlattenedRow, slot: SlotKey): DisplayRow {
  if (slot === "a") {
    return { key: row.key, valueA: row.value, valueB: null, status: null };
  }
  return { key: row.key, valueA: null, valueB: row.value, status: null };
}

function getSortValue(row: DisplayRow, key: SortKey): string {
  switch (key) {
    case "key":
      return row.key;
    case "valueA":
      return row.valueA ?? "";
    case "valueB":
      return row.valueB ?? "";
    case "status":
      return row.status ? STATUS_LABELS[row.status] : "";
    default:
      return "";
  }
}

export default function Page() {
  const [slots, setSlots] = useState<SlotsState>(() => ({ a: createEmptySlot(), b: createEmptySlot() }));
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "key", dir: "asc" });

  const fileLabelA = slots.a.name ?? "File A";
  const fileLabelB = slots.b.name ?? "File B";

  useEffect(() => {
    const allowed = ALLOWED_SORT_KEYS[viewMode];
    if (!allowed.includes(sort.key)) {
      setSort({ key: allowed[0], dir: "asc" });
    }
  }, [viewMode, sort.key]);

  useEffect(() => {
    if (viewMode === "a" && slots.a.rows.length === 0) {
      setViewMode(slots.b.rows.length ? "b" : "compare");
    } else if (viewMode === "b" && slots.b.rows.length === 0) {
      setViewMode(slots.a.rows.length ? "a" : "compare");
    } else if (
      viewMode === "compare" &&
      (!slots.a.rows.length || !slots.b.rows.length)
    ) {
      if (slots.a.rows.length && !slots.b.rows.length) {
        setViewMode("a");
      } else if (slots.b.rows.length && !slots.a.rows.length) {
        setViewMode("b");
      }
    }
  }, [viewMode, slots.a.rows.length, slots.b.rows.length]);

  async function handleFileChange(slot: SlotKey, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    await parseFile(slot, file);
  }

  async function parseFile(slot: SlotKey, file: File) {
    setSlots(prev => ({
      ...prev,
      [slot]: {
        name: file.name,
        sizeLabel: `${formatFileSize(file.size)}`,
        rows: [],
        loading: true,
        error: null,
      },
    }));

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-plist", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to parse file");

      const flat = flattenObject(json.data);
      setSlots(prev => ({
        ...prev,
        [slot]: {
          ...prev[slot],
          rows: flat,
          loading: false,
          error: null,
        },
      }));
    } catch (err: any) {
      setSlots(prev => ({
        ...prev,
        [slot]: {
          ...prev[slot],
          rows: [],
          loading: false,
          error: err?.message || "Unknown error",
        },
      }));
    }
  }

  function clearSlot(slot: SlotKey) {
    setSlots(prev => ({
      ...prev,
      [slot]: createEmptySlot(),
    }));
  }

  function sortBy(key: SortKey) {
    if (!ALLOWED_SORT_KEYS[viewMode].includes(key)) return;
    setSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  }

  const viewData = useMemo(() => {
    let baseRows: DisplayRow[] = [];
    if (viewMode === "a") {
      baseRows = slots.a.rows.map(row => mapToDisplayRow(row, "a"));
    } else if (viewMode === "b") {
      baseRows = slots.b.rows.map(row => mapToDisplayRow(row, "b"));
    } else {
      baseRows = buildComparisonRows(slots.a.rows, slots.b.rows).map(row => ({
        key: row.key,
        valueA: row.valueA,
        valueB: row.valueB,
        status: row.status,
      }));
    }

    const total = baseRows.length;
    const filterTerm = filter.trim().toLowerCase();

    const filteredRows = filterTerm
      ? baseRows.filter(row => {
          const haystack = [row.key, row.valueA ?? "", row.valueB ?? ""];
          if (row.status) {
            haystack.push(STATUS_LABELS[row.status]);
          }
          return haystack.some(value => value.toLowerCase().includes(filterTerm));
        })
      : baseRows;

    const sortedRows = [...filteredRows].sort((a, b) => {
      const aVal = getSortValue(a, sort.key);
      const bVal = getSortValue(b, sort.key);
      const direction = sort.dir === "asc" ? 1 : -1;
      return aVal.localeCompare(bVal, undefined, { sensitivity: "base" }) * direction;
    });

    const valueColumns: { key: "valueA" | "valueB"; label: string }[] = [];
    if (viewMode === "a" || viewMode === "compare") {
      valueColumns.push({ key: "valueA", label: `Value (${fileLabelA})` });
    }
    if (viewMode === "b" || viewMode === "compare") {
      valueColumns.push({ key: "valueB", label: `Value (${fileLabelB})` });
    }

    const exportColumns = ["Key Path", ...valueColumns.map(col => col.label)];
    const showStatus = viewMode === "compare";
    if (showStatus) exportColumns.push("Status");

    const exportRows: ExportRow[] = sortedRows.map(row => {
      const record: ExportRow = { "Key Path": row.key };
      valueColumns.forEach(col => {
        record[col.label] = col.key === "valueA" ? row.valueA : row.valueB;
      });
      if (showStatus) {
        record["Status"] = row.status ? STATUS_LABELS[row.status] : null;
      }
      return record;
    });

    const exportBaseName = (() => {
      if (viewMode === "compare") {
        return `${fileLabelA} vs ${fileLabelB}`;
      }
      return viewMode === "a" ? fileLabelA : fileLabelB;
    })();

    return {
      rows: sortedRows,
      total,
      filteredCount: sortedRows.length,
      valueColumns,
      showStatus,
      exportRows,
      exportColumns,
      exportFileStem: toSafeFileStem(exportBaseName),
      sheetName: toSheetName(
        viewMode === "compare"
          ? `Comparison ${fileLabelA} vs ${fileLabelB}`
          : `View ${viewMode === "a" ? fileLabelA : fileLabelB}`,
      ),
    };
  }, [viewMode, slots, filter, sort, fileLabelA, fileLabelB]);

  function handleExport(format: "csv" | "xlsx") {
    const fileName = `${viewData.exportFileStem}.${format}`;
    const config = {
      columns: viewData.exportColumns,
      fileName,
      sheetName: viewData.sheetName,
    };
    if (format === "csv") {
      exportCSV(viewData.exportRows, config);
    } else {
      exportXLSX(viewData.exportRows, config);
    }
  }

  const anyLoading = slots.a.loading || slots.b.loading;
  const compareDisabled = !slots.a.rows.length || !slots.b.rows.length;

  const viewTitle = (() => {
    if (viewMode === "compare") {
      return `Comparison ${fileLabelA} vs ${fileLabelB}`;
    }
    return viewMode === "a" ? fileLabelA : fileLabelB;
  })();

  return (
    <div className="container py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Plist / Archive Comparator</h1>
        <p className="text-sm text-gray-600">
          Upload up to two <code>.plist</code> or <code>.archive</code> files, compare their flattened key paths
          side by side, and export the current view as CSV or XLSX.
        </p>
      </header>

      <section className="card p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {(["a", "b"] as const).map(slot => {
            const state = slots[slot];
            const inputId = `file-input-${slot}`;
            const label = slot === "a" ? "File A" : "File B";
            return (
              <div key={slot} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-700">{label}</p>
                    {state.name ? (
                      <p className="text-sm text-gray-600 break-all">{state.name}</p>
                    ) : (
                      <p className="text-xs text-gray-500">Select a file to parse and compare.</p>
                    )}
                    {state.sizeLabel && (
                      <p className="text-xs text-gray-500">Size: {state.sizeLabel}</p>
                    )}
                  </div>
                  {state.name && (
                    <button
                      className="btn btn-sm border border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => clearSlot(slot)}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label htmlFor={inputId} className="btn btn-sm btn-primary cursor-pointer">
                    {state.name ? "Replace file" : "Upload file"}
                  </label>
                  <input
                    id={inputId}
                    className="hidden"
                    type="file"
                    accept=".plist,.archive"
                    onChange={event => {
                      void handleFileChange(slot, event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {state.loading && <span className="text-xs text-gray-500">Parsing…</span>}
                </div>

                {state.error && (
                  <p className="text-xs text-red-600">Error: {state.error}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">Max file size: 10 MB per upload.</p>
      </section>

      <section className="card p-6 space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              className={`btn ${viewMode === "a" ? "btn-primary" : ""}`}
              type="button"
              disabled={!slots.a.rows.length}
              onClick={() => setViewMode("a")}
            >
              View {fileLabelA}
            </button>
            <button
              className={`btn ${viewMode === "b" ? "btn-primary" : ""}`}
              type="button"
              disabled={!slots.b.rows.length}
              onClick={() => setViewMode("b")}
            >
              View {fileLabelB}
            </button>
            <button
              className={`btn ${viewMode === "compare" ? "btn-primary" : ""}`}
              type="button"
              disabled={compareDisabled}
              onClick={() => setViewMode("compare")}
            >
              Compare {fileLabelA} &amp; {fileLabelB}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              className="input sm:max-w-xs"
              placeholder="Filter by key or value…"
              value={filter}
              onChange={event => setFilter(event.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn" type="button" onClick={() => handleExport("csv")}>
                Export CSV
              </button>
              <button className="btn btn-primary" type="button" onClick={() => handleExport("xlsx")}>
                Export XLSX
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Viewing: <span className="font-medium text-gray-800">{viewTitle}</span>
          </p>
          <p className="flex gap-4">
            <span>Total entries in current view: {viewData.total}</span>
            <span>Showing filtered rows: {viewData.filteredCount}</span>
          </p>
        </div>

        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="th cursor-pointer" onClick={() => sortBy("key")}>
                  Key Path {sort.key === "key" ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                {viewData.valueColumns.map(col => (
                  <th
                    key={col.key}
                    className="th cursor-pointer"
                    onClick={() => sortBy(col.key === "valueA" ? "valueA" : "valueB")}
                  >
                    {col.label} {sort.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                ))}
                {viewData.showStatus && (
                  <th className="th cursor-pointer" onClick={() => sortBy("status")}>
                    Status {sort.key === "status" ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {viewData.rows.map(row => (
                <tr key={row.key} className="align-top">
                  <td className="td font-mono text-xs pr-4">{row.key}</td>
                  {viewData.valueColumns.map(col => {
                    const value = col.key === "valueA" ? row.valueA : row.valueB;
                    return (
                      <td key={col.key} className="td text-xs whitespace-pre-wrap break-words">
                        {value ?? <span className="text-gray-400">—</span>}
                      </td>
                    );
                  })}
                  {viewData.showStatus && (
                    <td className="td text-xs whitespace-nowrap">
                      {row.status ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[row.status]}`}>
                          {STATUS_LABELS[row.status]}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!anyLoading && viewData.rows.length === 0 && (
                <tr>
                  <td
                    className="td text-sm text-gray-500"
                    colSpan={1 + viewData.valueColumns.length + (viewData.showStatus ? 1 : 0)}
                  >
                    No data — upload one or two files to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-gray-500">
        Tips: Arrays use index notation like <code>[0]</code>. Nested keys appear as dot notation, e.g. <code>root.section.key</code>.
      </footer>
    </div>
  );
}
