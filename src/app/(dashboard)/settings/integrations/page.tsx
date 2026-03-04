"use client"

import * as React from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { IntegrationCard } from "@/components/integration-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2 } from "lucide-react"
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
    <div className="space-y-8">
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

      <Separator />

      {/* Platform credentials for receipt automation */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Plattform-Zugangsdaten</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Zugangsdaten fuer das lokale Playwright-Script (<code>scripts/airbnb-receipt.js</code>).
          Das Script liest diese verschluesselt aus der Datenbank.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PlatformCredentialsCard platform="airbnb" title="Airbnb" />
        <PlatformCredentialsCard platform="booking" title="Booking.com" />
      </div>
    </div>
  )
}

// -- Platform Credentials Card ------------------------------------------------

function PlatformCredentialsCard({
  platform,
  title,
}: {
  platform: "airbnb" | "booking"
  title: string
}) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [totpSecret, setTotpSecret] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    fetch(`/api/platform-credentials/${platform}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.credentials) {
          setEmail(json.credentials.email ?? "")
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [platform])

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/platform-credentials/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || null,
          password: password || null,
          totpSecret: totpSecret || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Fehler"); return }
      setSaved(true)
      setPassword("") // clear password from UI
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {platform === "airbnb"
            ? "Login-Daten fuer das lokale Playwright-Script (scripts/airbnb-receipt.js)."
            : "Zugangsdaten fuer zukuenftige Booking.com API-Anbindung."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {saved && (
              <Alert className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                <AlertDescription>Gespeichert.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${platform}-email`}>E-Mail</Label>
              <Input
                id={`${platform}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${title}-Login E-Mail`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${platform}-password`}>Passwort</Label>
              <Input
                id={`${platform}-password`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leer lassen = nicht aendern"
              />
            </div>
            {platform === "airbnb" && (
              <div className="space-y-2">
                <Label htmlFor="airbnb-totp">2FA TOTP Secret</Label>
                <Input
                  id="airbnb-totp"
                  type="password"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  placeholder="Optional — fuer 2FA"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              Das Script liest Zugangsdaten aus <code>scripts/.env</code>.
              Siehe <code>scripts/README.md</code> fuer die vollstaendige Einrichtung.
            </p>
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
