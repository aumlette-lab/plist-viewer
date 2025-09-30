"use client";

import { useState, useMemo } from "react";
import { flattenObject, toCSV, type FlattenedRow } from "@/lib/utils";
import { exportXLSX } from "@/lib/export-xlsx";

type Sort = { key: "key" | "value"; dir: "asc" | "desc" };

export default function Page() {
  const [rows, setRows] = useState<FlattenedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "key", dir: "asc" });

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await parseFile(file);
  }

  async function parseFile(file: File) {
    setError(null);
    setLoading(true);
    setRows([]);
    setFileInfo(`${file.name} — ${(file.size/1024).toFixed(1)} KB`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-plist", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to parse");

      const flat = flattenObject(json.data);
      setRows(flat);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function sortBy(k: "key" | "value") {
    setSort(s => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }));
  }

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let out = rows;
    if (f) out = out.filter(r => r.key.toLowerCase().includes(f) || r.value.toLowerCase().includes(f));
    out = [...out].sort((a, b) => {
      const va = a[sort.key].toLowerCase();
      const vb = b[sort.key].toLowerCase();
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [rows, filter, sort]);

  function downloadCSV() {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plist.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Plist / Archive Viewer</h1>
        <p className="text-sm text-gray-600">
          Upload a <code>.plist</code> or Procreate <code>.archive</code> file (XML or binary). We parse it server‑side,
          flatten nested keys, and render a sortable table. Export to CSV or XLSX.
        </p>
      </header>

      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".plist,.archive"
            onChange={onFileChange}
            className="input"
          />

	  <button
  className="btn"
  onClick={() => {
    setRows([]);
    setError(null);
    setFileInfo(null);

    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    if (input) {
      input.value = "";
    }
  }}
>
  Reset
</button>


        </div>
        <p className="text-xs text-gray-500">Max file size: 10 MB.</p>
        {fileInfo && <span className="badge">{fileInfo}</span>}
        {loading && <div className="text-sm">Parsing…</div>}
        {error && <div className="text-sm text-red-600">Error: {error}</div>}
      </section>

      <section className="card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            className="input sm:max-w-xs"
            placeholder="Filter by key or value…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn" onClick={downloadCSV}>Export CSV</button>
            <button className="btn btn-primary" onClick={() => exportXLSX(filtered)}>Export XLSX</button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="th cursor-pointer" onClick={() => sortBy("key")}>
                  Key {sort.key === "key" ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="th cursor-pointer" onClick={() => sortBy("value")}>
                  Value {sort.key === "value" ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="td font-mono text-xs pr-4">{r.key}</td>
                  <td className="td text-xs whitespace-pre-wrap break-words">{r.value}</td>
                </tr>
              ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td className="td text-sm text-gray-500" colSpan={2}>No data — upload a file to begin.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-gray-500">
        Tips: Arrays are shown with index notation like <code>[0]</code>. Nested keys use dot notation, e.g.{" "}
        <code>root.section.key</code>.
      </footer>
    </div>
  );
}
