import "./globals.css"

export const metadata = {
  title: {
    template: "%s — ALMAZ",
    default: "ALMAZ — Management Penjualan",
  },
  description: "Sistem manajemen distribusi dan penjualan rokok",
}

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
