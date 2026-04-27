"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"

const TIPS = [
  "Pastikan Caps Lock tidak aktif saat memasukkan password.",
  "Jangan bagikan password kamu ke siapa pun.",
  "Gunakan password yang kuat dan unik.",
  "Hubungi admin jika kamu lupa password.",
]

function LoadingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-white"
          style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
    </span>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus]     = useState(null) // "loading" | "success" | "error"
  const [tipIdx, setTipIdx]     = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setStatus("loading")
    const res = await signIn("credentials", { username, password, redirect: false })
    if (res?.error) {
      setStatus("error")
    } else {
      setStatus("success")
      setTimeout(() => router.push("/"), 1200)
    }
  }

  const isLoading = status === "loading"
  const isSuccess = status === "success"

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-lg font-bold text-white shadow-md">
            A
          </div>
          <h1 className="text-xl font-semibold tracking-tight">ALMAZ</h1>
          <p className="mt-1 text-sm text-neutral-500">Management Penjualan</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Progress bar saat loading */}
          <div className="h-0.5 bg-neutral-100 relative overflow-hidden">
            {isLoading && (
              <div
                className="absolute inset-y-0 left-0 bg-neutral-900 transition-all"
                style={{ animation: "progress 1.2s ease-in-out infinite" }}
              />
            )}
            {isSuccess && <div className="absolute inset-0 bg-green-500 transition-all duration-500" />}
            <style>{`@keyframes progress{0%{width:0%;left:0}50%{width:70%;left:10%}100%{width:0%;left:100%}}`}</style>
          </div>

          <form onSubmit={submit} className="space-y-4 p-6">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setStatus(null) }}
                placeholder="Masukkan username"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-50 disabled:text-neutral-400"
                autoFocus
                required
                disabled={isLoading || isSuccess}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setStatus(null) }}
                  placeholder="Masukkan password"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 pr-10 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-50 disabled:text-neutral-400"
                  required
                  disabled={isLoading || isSuccess}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                  tabIndex={-1}
                  disabled={isLoading}
                >
                  {showPass
                    ? <EyeOff className="h-4 w-4" strokeWidth={2} />
                    : <Eye    className="h-4 w-4" strokeWidth={2} />
                  }
                </button>
              </div>
            </div>

            {/* Alert error */}
            {status === "error" && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">!</span>
                <div>
                  <p className="text-xs font-semibold text-red-700">Login gagal</p>
                  <p className="text-xs text-red-600 mt-0.5">Username atau password salah, atau akun tidak aktif.</p>
                </div>
              </div>
            )}

            {/* Alert success */}
            {isSuccess && (
              <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-green-700">Berhasil masuk! Mengalihkan...</p>
              </div>
            )}

            {/* Tombol */}
            <button
              type="submit"
              disabled={isLoading || isSuccess}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  <span>Memverifikasi <LoadingDots /></span>
                </>
              ) : isSuccess ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Berhasil!
                </>
              ) : (
                "Masuk"
              )}
            </button>
          </form>

          {/* Tips rotating */}
          <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3 min-h-[48px] flex items-center">
            <p
              key={tipIdx}
              className="text-[11px] text-neutral-400 leading-relaxed transition-opacity duration-500"
              style={{ animation: "fadeTip 3.5s ease-in-out" }}
            >
              💡 {TIPS[tipIdx]}
            </p>
            <style>{`@keyframes fadeTip{0%{opacity:0}15%{opacity:1}85%{opacity:1}100%{opacity:0}}`}</style>
          </div>
        </div>
      </div>
    </div>
  )
}
