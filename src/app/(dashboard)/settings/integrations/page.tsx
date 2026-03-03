"use client"

import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { IntegrationCard } from "@/components/integration-card"
import type { IntegrationSetting } from "@/lib/types"

export default function IntegrationsPage() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [integrations, setIntegrations] = React.useState<IntegrationSetting[]>(
    []
  )
  const [savingPlatform, setSavingPlatform] = React.useState<string | null>(
    null
  )
  const [testingPlatform, setTestingPlatform] = React.useState<string | null>(
    null
  )

  React.useEffect(() => {
    async function loadIntegrations() {
      try {
        const res = await fetch("/api/integrations")
        if (res.ok) {
          const data = await res.json()
          setIntegrations(data)
        }
      } catch (err) {
        console.error("Failed to load integrations:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadIntegrations()
  }, [])

  async function handleSave(platform: string, apiKey: string) {
    setSavingPlatform(platform)
    try {
      const res = await fetch(`/api/integrations/${platform}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Speichern fehlgeschlagen")
      }

      setIntegrations((prev) =>
        prev.map((i) =>
          i.platform === platform
            ? { ...i, hasApiKey: true, lastTestStatus: "untested" as const, lastTestedAt: null, lastErrorMsg: null }
            : i
        )
      )
    } catch (err) {
      console.error("Save failed:", err)
      throw err
    } finally {
      setSavingPlatform(null)
    }
  }

  async function handleTest(platform: string) {
    setTestingPlatform(platform)
    try {
      const res = await fetch(`/api/integrations/${platform}/test`, {
        method: "POST",
      })

      const data = await res.json()

      setIntegrations((prev) =>
        prev.map((i) =>
          i.platform === platform
            ? {
                ...i,
                lastTestStatus: data.lastTestStatus ?? (data.success ? "success" : "error"),
                lastTestedAt: data.lastTestedAt ?? new Date().toISOString(),
                lastErrorMsg: data.lastErrorMsg ?? data.error ?? null,
              }
            : i
        )
      )
    } catch (err) {
      console.error("Test failed:", err)
    } finally {
      setTestingPlatform(null)
    }
  }

  const smoobu = integrations.find((i) => i.platform === "smoobu")
  const lexware = integrations.find((i) => i.platform === "lexware")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrationen</h1>
        <p className="text-muted-foreground">
          Verbinden Sie Ihre Plattformen per API-Key.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-6 space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-10 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-36" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {smoobu && (
            <IntegrationCard
              platform="smoobu"
              title="Smoobu"
              description="Buchungsverwaltung und Objektdaten. Verbinden Sie Ihr Smoobu-Konto, um Buchungen und Objekte automatisch abzurufen."
              hasApiKey={smoobu.hasApiKey}
              lastTestStatus={smoobu.lastTestStatus}
              lastTestedAt={smoobu.lastTestedAt}
              lastErrorMsg={smoobu.lastErrorMsg}
              onSave={(apiKey) => handleSave("smoobu", apiKey)}
              onTest={() => handleTest("smoobu")}
              isSaving={savingPlatform === "smoobu"}
              isTesting={testingPlatform === "smoobu"}
            />
          )}

          {lexware && (
            <IntegrationCard
              platform="lexware"
              title="Lexware Office"
              description="Automatische Rechnungserstellung. Hinweis: Lexware XL-Plan oder hoeher erforderlich fuer die API-Nutzung."
              hasApiKey={lexware.hasApiKey}
              lastTestStatus={lexware.lastTestStatus}
              lastTestedAt={lexware.lastTestedAt}
              lastErrorMsg={lexware.lastErrorMsg}
              onSave={(apiKey) => handleSave("lexware", apiKey)}
              onTest={() => handleTest("lexware")}
              isSaving={savingPlatform === "lexware"}
              isTesting={testingPlatform === "lexware"}
            />
          )}
        </div>
      )}
    </div>
  )
}
