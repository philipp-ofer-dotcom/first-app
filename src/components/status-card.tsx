"use client"

import { CheckCircle2, XCircle, HelpCircle } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { StatusCardProps, TestStatus } from "@/lib/types"

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
        label: "Nicht konfiguriert",
        icon: HelpCircle,
        badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      }
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

export function StatusCard({
  title,
  description,
  status,
  lastTestedAt,
  errorMessage,
  isLoading = false,
}: StatusCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2 h-4 w-36" />
        </CardContent>
      </Card>
    )
  }

  const config = getStatusConfig(status)
  const StatusIcon = config.icon

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
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Letzter Test: {formatDate(lastTestedAt)}
        </p>
        {errorMessage && status === "error" && (
          <p className="mt-1 text-sm text-destructive">{errorMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}
