import * as XLSX from "xlsx";
import { FlattenedRow } from "./utils";

export function exportXLSX(rows: FlattenedRow[], fileName = "plist.xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "plist");
  XLSX.writeFile(wb, fileName);
}
