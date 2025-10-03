import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

export type ExportRow = Record<string, string | null>;

export type ExportConfig = {
  columns: string[];
  fileName?: string;
  sheetName?: string;
};

const DEFAULT_FILENAMES: Record<ExportFormat, string> = {
  csv: "plist.csv",
  xlsx: "plist.xlsx",
};

function buildWorkbook(rows: ExportRow[], columns: string[], sheetName: string) {
  const ws = rows.length
    ? XLSX.utils.json_to_sheet(rows, { header: columns })
    : XLSX.utils.aoa_to_sheet([columns]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return { wb, ws };
}

function exportRows(rows: ExportRow[], format: ExportFormat, config: ExportConfig) {
  const { columns, fileName, sheetName } = config;
  const targetName = fileName ?? DEFAULT_FILENAMES[format];
  const { wb, ws } = buildWorkbook(rows, columns, sheetName ?? "plist");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = targetName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  XLSX.writeFile(wb, targetName, { bookType: "xlsx" });
}

export function exportCSV(rows: ExportRow[], config: ExportConfig) {
  exportRows(rows, "csv", config);
}

export function exportXLSX(rows: ExportRow[], config: ExportConfig) {
  exportRows(rows, "xlsx", config);
}
