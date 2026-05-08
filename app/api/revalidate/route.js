import { revalidateTag, revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

export async function POST(req) {
  try {
    // Clear specific tags
    revalidateTag("sales-list")
    revalidateTag("toko-list")

    // Clear specific paths
    revalidatePath("/sales")
    revalidatePath("/toko")
    revalidatePath("/distribusi")

    return NextResponse.json({ success: true, message: "Cache cleared for sales, toko, distribusi" })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
