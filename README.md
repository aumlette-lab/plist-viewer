# 📂 Plist / Archive Comparator

Modern viewer for Apple property lists and archives. Parse XML or binary plists, flatten nested structures, compare two files side by side, and export the results.

### ✅ Current Features

- Dual-file uploader with replace/remove actions, filename and size labels
- Three viewing modes: File A, File B, and Comparison (diff badges for same/different/missing keys)
- Sortable, filterable tables with live counts of total and filtered rows
- CSV/XLSX export that mirrors the active view (dynamic column titles, filenames)
- Light/dark theme toggle with persisted preference
- Powered by **Next.js**, **TypeScript**, **Tailwind CSS**, and **xlsx**

---

## 🚀 Getting Started (Local)

Clone the repo and install dependencies:

```bash
git clone https://github.com/aumlette-lab/plist-viewer.git
cd plist-viewer
npm install
npm run dev
