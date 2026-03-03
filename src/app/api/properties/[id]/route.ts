import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  displayName: z.string().max(200).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: "ID fehlt" }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    const body = await request.json()
    const bodyResult = patchSchema.safeParse(body)
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: bodyResult.error.issues[0]?.message ?? "Ungueltige Eingabe" },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (bodyResult.data.isActive !== undefined) {
      updates.is_active = bodyResult.data.isActive
    }
    if (bodyResult.data.notes !== undefined) {
      updates.notes = bodyResult.data.notes
    }
    if (bodyResult.data.displayName !== undefined) {
      updates.display_name = bodyResult.data.displayName
    }

    const { data: updated, error } = await supabase
      .from("properties")
      .update(updates)
      .eq("id", id)
      .select(
        "id, smoobu_id, name, location, display_name, notes, is_active, is_archived, synced_at"
      )
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Objekt nicht gefunden" }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      id: updated.id,
      smoobuId: updated.smoobu_id,
      name: updated.name,
      location: updated.location,
      displayName: updated.display_name,
      notes: updated.notes,
      isActive: updated.is_active,
      isArchived: updated.is_archived,
      syncedAt: updated.synced_at,
    })
  } catch (err) {
    console.error("PATCH /api/properties/[id] error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
