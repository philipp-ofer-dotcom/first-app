import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decrypt } from "@/lib/encryption"

const platformSchema = z.enum(["smoobu", "lexware"])

async function testSmoobuConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://login.smoobu.com/api/me", {
      method: "GET",
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      return { success: true }
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: "Ungueltiger API-Key. Bitte pruefen Sie Ihren Smoobu API-Key." }
    }

    return { success: false, error: `Smoobu API Fehler: HTTP ${response.status}` }
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Smoobu API nicht erreichbar (Timeout). Bitte versuchen Sie es spaeter erneut." }
    }
    return { success: false, error: "Verbindung zu Smoobu fehlgeschlagen. Bitte versuchen Sie es spaeter erneut." }
  }
}

async function testLexwareConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.lexware.io/v1/profile", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      return { success: true }
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: "Ungueltiger API-Key. Bitte pruefen Sie Ihren Lexware API-Key. Hinweis: Lexware XL-Plan oder hoeher erforderlich." }
    }

    return { success: false, error: `Lexware API Fehler: HTTP ${response.status}` }
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { success: false, error: "Lexware API nicht erreichbar (Timeout). Bitte versuchen Sie es spaeter erneut." }
    }
    return { success: false, error: "Verbindung zu Lexware fehlgeschlagen. Bitte versuchen Sie es spaeter erneut." }
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform } = await params

    const platformResult = platformSchema.safeParse(platform)
    if (!platformResult.success) {
      return NextResponse.json(
        { error: "Ungueltige Plattform. Erlaubt: smoobu, lexware" },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 })
    }

    // Fetch the encrypted key from DB
    const { data: integration, error: fetchError } = await supabase
      .from("integration_settings")
      .select("id, api_key_encrypted")
      .eq("platform", platformResult.data)
      .limit(1)
      .single()

    if (fetchError || !integration) {
      return NextResponse.json(
        { error: "Kein API-Key fuer diese Plattform gespeichert. Bitte speichern Sie zuerst einen API-Key." },
        { status: 404 }
      )
    }

    // Decrypt the key
    const apiKey = decrypt(integration.api_key_encrypted)

    // Test the connection
    const testResult =
      platformResult.data === "smoobu"
        ? await testSmoobuConnection(apiKey)
        : await testLexwareConnection(apiKey)

    // Update the test status in DB
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("integration_settings")
      .update({
        last_tested_at: now,
        last_test_status: testResult.success ? "success" : "error",
        last_error_msg: testResult.error ?? null,
        updated_at: now,
      })
      .eq("id", integration.id)

    if (updateError) {
      console.error("Failed to update test status:", updateError)
    }

    return NextResponse.json({
      success: testResult.success,
      lastTestStatus: testResult.success ? "success" : "error",
      lastTestedAt: now,
      lastErrorMsg: testResult.error ?? null,
    })
  } catch (err) {
    console.error("POST /api/integrations/[platform]/test error:", err)
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    )
  }
}
