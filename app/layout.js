import "./globals.css"

export const metadata = {
  title: "ALMAZ — Management Penjualan",
  description: "Sistem manajemen distribusi dan penjualan rokok",
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  )
}
