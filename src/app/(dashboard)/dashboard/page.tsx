"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusCard } from "@/components/status-card"
import type { IntegrationSetting, Property } from "@/lib/types"

export default function DashboardPage() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [integrations, setIntegrations] = React.useState<IntegrationSetting[]>([])
  const [properties, setProperties] = React.useState<Property[]>([])

  React.useEffect(() => {
    async function loadData() {
      try {
        const [integrationsRes, propertiesRes] = await Promise.all([
          fetch("/api/integrations"),
          fetch("/api/properties"),
        ])

        if (integrationsRes.ok) {
          const data = await integrationsRes.json()
          setIntegrations(data)
        }

        if (propertiesRes.ok) {
          const data = await propertiesRes.json()
          setProperties(data)
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  const smoobu = integrations.find((i) => i.platform === "smoobu")
  const lexware = integrations.find((i) => i.platform === "lexware")

  const totalProperties = properties.filter((p) => !p.isArchived).length
  const activeProperties = properties.filter(
    (p) => p.isActive && !p.isArchived
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Verbindungsstatus und Objektuebersicht
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          aria-label="Seite aktualisieren"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="Smoobu"
          description="Buchungsverwaltung & Objekte"
          status={smoobu?.lastTestStatus ?? "untested"}
          lastTestedAt={smoobu?.lastTestedAt ?? null}
          errorMessage={smoobu?.lastErrorMsg}
          isLoading={isLoading}
        />

        <StatusCard
          title="Lexware Office"
          description="Rechnungserstellung"
          status={lexware?.lastTestStatus ?? "untested"}
          lastTestedAt={lexware?.lastTestedAt ?? null}
          errorMessage={lexware?.lastErrorMsg}
          isLoading={isLoading}
        />

        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Objekte</CardTitle>
              <CardDescription>Ferienwohnungen aus Smoobu</CardDescription>
            </CardHeader>
            <CardContent>
              {totalProperties === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Objekte synchronisiert.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-3xl font-bold">
                    {activeProperties}{" "}
                    <span className="text-lg font-normal text-muted-foreground">
                      von {totalProperties}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    aktive Objekte
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
