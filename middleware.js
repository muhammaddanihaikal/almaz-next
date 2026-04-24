import { NextResponse } from "next/server"

export default function middleware(req) {
  if (req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url))
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
