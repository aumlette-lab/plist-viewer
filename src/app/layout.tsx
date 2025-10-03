import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plist / Archive Viewer",
  description: "Upload .plist or .archive files, view, sort, and export to CSV/XLSX"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
