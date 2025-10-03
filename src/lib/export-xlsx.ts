import * as XLSX from "xlsx";
import { FlattenedRow } from "./utils";

export type ExportFormat = "csv" | "xlsx";

const DEFAULT_FILENAMES: Record<ExportFormat, string> = {
  csv: "plist.csv",
  xlsx: "plist.xlsx",
};

function buildWorkbook(rows: FlattenedRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "plist");
  return { wb, ws };
}

export function exportRows(rows: FlattenedRow[], format: ExportFormat, fileName?: string) {
  const targetName = fileName ?? DEFAULT_FILENAMES[format];
  const { wb, ws } = buildWorkbook(rows);

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

export function exportCSV(rows: FlattenedRow[], fileName?: string) {
  exportRows(rows, "csv", fileName);
}

export function exportXLSX(rows: FlattenedRow[], fileName?: string) {
  exportRows(rows, "xlsx", fileName);
}
