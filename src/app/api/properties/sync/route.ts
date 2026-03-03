import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decrypt } from "@/lib/encryption"

interface SmoobuApartment {
  id: number
  name: string
  location?: {
    city?: string
    street?: string
    country?: string
  }
}

interface SmoobuApartmentsResponse {
  apartments: Record<string, SmoobuApartment>
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    // Get the Smoobu API key
    const { data: integration, error: fetchError } = await supabase
      .from("integration_settings")
      .select("api_key_encrypted")
      .eq("platform", "smoobu")
      .limit(1)
      .single()

    if (fetchError || !integration) {
      return NextResponse.json(
        { error: "Kein Smoobu API-Key gespeichert. Bitte speichern Sie zuerst einen API-Key unter Integrationen." },
        { status: 404 }
      )
    }

    const apiKey = decrypt(integration.api_key_encrypted)

    // Call Smoobu API
    const response = await fetch("https://login.smoobu.com/api/apartments", {
      method: "GET",
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "Smoobu API-Key ungueltig. Bitte aktualisieren Sie Ihren API-Key." },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { error: `Smoobu API Fehler: HTTP ${response.status}` },
        { status: 502 }
      )
    }

    const data: SmoobuApartmentsResponse = await response.json()
    const apartments = data.apartments ?? {}

    const now = new Date().toISOString()
    const smoobuIds: string[] = []

    // Upsert each apartment
    for (const apartment of Object.values(apartments)) {
      const smoobuId = String(apartment.id)
      smoobuIds.push(smoobuId)

      const locationParts = [
        apartment.location?.street,
        apartment.location?.city,
        apartment.location?.country,
      ].filter(Boolean)
      const location = locationParts.join(", ") || "Unbekannt"

      const { error: upsertError } = await supabase
        .from("properties")
        .upsert(
          {
            smoobu_id: smoobuId,
            name: apartment.name || "Unbenannt",
            location,
            is_archived: false,
            synced_at: now,
            updated_at: now,
          },
          { onConflict: "smoobu_id" }
        )

      if (upsertError) {
        console.error(`Failed to upsert property ${smoobuId}:`, upsertError)
      }
    }

    // Archive properties that are no longer in Smoobu
    if (smoobuIds.length > 0) {
      const { error: archiveError } = await supabase
        .from("properties")
        .update({ is_archived: true, updated_at: now })
        .eq("is_archived", false)
        .not("smoobu_id", "in", `(${smoobuIds.join(",")})`)

      if (archiveError) {
        console.error("Failed to archive old properties:", archiveError)
      }
    }

    // Fetch updated properties
    const { data: properties, error: listError } = await supabase
      .from("properties")
      .select(
        "id, smoobu_id, name, location, display_name, notes, is_active, is_archived, synced_at"
      )
      .eq("is_archived", false)
      .order("name", { ascending: true })
      .limit(500)

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

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

    return NextResponse.json({
      success: true,
      syncedAt: now,
      properties: result,
      count: result.length,
    })
  } catch (err) {
    console.error("POST /api/properties/sync error:", err)
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Smoobu API nicht erreichbar (Timeout). Bitte versuchen Sie es spaeter erneut." },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
