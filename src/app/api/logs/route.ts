import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const level = searchParams.get("level")         // info | warning | error
  const category = searchParams.get("category")   // invoice | booking | receipt | sync | webhook | transfer | system
  const limit = Math.min(Number(searchParams.get("limit") || "100"), 500)
  const offset = Number(searchParams.get("offset") || "0")

  let query = supabase
    .from("system_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (level) query = query.eq("level", level)
  if (category) query = query.eq("category", category)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: "DB Fehler" }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 })
}
