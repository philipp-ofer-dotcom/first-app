"use client"

import * as React from "react"
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle, HelpCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type { IntegrationCardProps, TestStatus } from "@/lib/types"

function getStatusConfig(status: TestStatus) {
  switch (status) {
    case "success":
      return {
        label: "Verbunden",
        icon: CheckCircle2,
        badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      }
    case "error":
      return {
        label: "Fehler",
        icon: XCircle,
        badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      }
    case "untested":
    default:
      return {
        label: "Nicht getestet",
        icon: HelpCircle,
        badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      }
  }
}

export function IntegrationCard({
  platform,
  title,
  description,
  hasApiKey,
  lastTestStatus,
  lastTestedAt,
  lastErrorMsg,
  onSave,
  onTest,
  isSaving = false,
  isTesting = false,
}: IntegrationCardProps) {
  const [apiKey, setApiKey] = React.useState("")
  const [showKey, setShowKey] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)

  const config = getStatusConfig(lastTestStatus)
  const StatusIcon = config.icon

  const maskedDisplay = hasApiKey ? "**********" : ""

  async function handleSave() {
    if (!apiKey.trim()) {
      setLocalError("Bitte geben Sie einen API-Key ein.")
      return
    }
    setLocalError(null)
    try {
      await onSave(apiKey)
      setApiKey("")
      setShowKey(false)
    } catch {
      setLocalError("Fehler beim Speichern des API-Keys.")
    }
  }

  async function handleTest() {
    setLocalError(null)
    try {
      await onTest()
    } catch {
      setLocalError("Fehler beim Testen der Verbindung.")
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Noch nie"
    const date = new Date(dateStr)
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Badge className={config.badgeClass} variant="outline">
            <StatusIcon className="mr-1 h-3.5 w-3.5" />
            {config.label}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${platform}-api-key`}>API-Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={`${platform}-api-key`}
                type={showKey ? "text" : "password"}
                placeholder={hasApiKey ? maskedDisplay : "API-Key eingeben..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isSaving}
                aria-label={`${title} API-Key`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "API-Key verbergen" : "API-Key anzeigen"}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          {hasApiKey && (
            <p className="text-xs text-muted-foreground">
              Ein API-Key ist bereits hinterlegt. Geben Sie einen neuen ein, um ihn zu ersetzen.
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Letzter Test: {formatDate(lastTestedAt)}
        </p>

        {lastErrorMsg && lastTestStatus === "error" && (
          <p className="text-sm text-destructive">{lastErrorMsg}</p>
        )}
        {localError && (
          <p className="text-sm text-destructive" role="alert">
            {localError}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={handleSave}
          disabled={isSaving || !apiKey.trim()}
          className="w-full sm:w-auto"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Speichern...
            </>
          ) : (
            "Speichern"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isTesting || !hasApiKey}
          className="w-full sm:w-auto"
        >
          {isTesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Teste...
            </>
          ) : (
            "Verbindung testen"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
