import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const { data: properties, error } = await supabase
      .from("properties")
      .select(
        "id, smoobu_id, name, location, display_name, notes, is_active, is_archived, synced_at"
      )
      .eq("is_archived", false)
      .order("name", { ascending: true })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map to frontend shape (camelCase)
    const result = (properties ?? []).map((row) => ({
      id: row.id,
      smoobuId: row.smoobu_id,
      name: row.name,
      location: row.location,
      displayName: row.display_name,
      notes: row.notes,
      isActive: row.is_active,
      isArchived: row.is_archived,
      syncedAt: row.synced_at,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error("GET /api/properties error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
