"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { RefreshCw, ChevronDown, ChevronRight, AlertCircle, Info, AlertTriangle } from "lucide-react"

interface LogEntry {
  id: string
  created_at: string
  level: "info" | "warning" | "error"
  category: string
  action: string
  entity_type: string | null
  entity_id: string | null
  message: string
  details: Record<string, unknown> | null
}

const LEVEL_CONFIG = {
  info: {
    label: "Info",
    variant: "secondary" as const,
    icon: Info,
    className: "text-blue-600",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
  },
  warning: {
    label: "Warnung",
    variant: "outline" as const,
    icon: AlertTriangle,
    className: "text-yellow-600",
    badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  error: {
    label: "Fehler",
    variant: "destructive" as const,
    icon: AlertCircle,
    className: "text-red-600",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  invoice: "Rechnung",
  booking: "Buchung",
  receipt: "Beleg",
  sync: "Sync",
  webhook: "Webhook",
  transfer: "Transfer",
  system: "System",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false)
  const cfg = LEVEL_CONFIG[entry.level]
  const Icon = cfg.icon
  const hasDetails = entry.details && Object.keys(entry.details).length > 0

  return (
    <Collapsible open={open} onOpenChange={hasDetails ? setOpen : undefined}>
      <TableRow className={entry.level === "error" ? "bg-red-50/40" : entry.level === "warning" ? "bg-yellow-50/40" : ""}>
        <TableCell className="w-36 text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(entry.created_at)}
        </TableCell>
        <TableCell className="w-24">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
          </span>
        </TableCell>
        <TableCell className="w-24">
          <Badge variant="outline" className="text-xs">
            {CATEGORY_LABELS[entry.category] ?? entry.category}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">
          <div className="flex items-start gap-2">
            {hasDetails && (
              <CollapsibleTrigger asChild>
                <button className="mt-0.5 text-muted-foreground hover:text-foreground flex-shrink-0">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
            )}
            <span className={entry.level === "error" ? "text-red-700 font-medium" : ""}>
              {entry.message}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {hasDetails && (
        <CollapsibleContent asChild>
          <TableRow className={entry.level === "error" ? "bg-red-50/60" : "bg-muted/30"}>
            <TableCell colSpan={4} className="py-2 pl-12">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-background/80 rounded p-3 border max-h-64 overflow-auto">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [levelFilter, setLevelFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [offset, setOffset] = useState(0)
  const limit = 50

  const fetchLogs = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(off) })
      if (levelFilter !== "all") params.set("level", levelFilter)
      if (categoryFilter !== "all") params.set("category", categoryFilter)

      const res = await fetch(`/api/logs?${params}`)
      const data = await res.json()
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [levelFilter, categoryFilter])

  useEffect(() => {
    fetchLogs(0)
  }, [fetchLogs])

  const errorCount = logs.filter((l) => l.level === "error").length
  const warningCount = logs.filter((l) => l.level === "warning").length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aktivitäten & Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Alle Systemaktivitäten und Fehlermeldungen im Überblick
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchLogs(0)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gesamt (aktuelle Seite)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card className={warningCount > 0 ? "border-yellow-200 bg-yellow-50/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Warnungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
          </CardContent>
        </Card>
        <Card className={errorCount > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" /> Fehler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Level</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warnung</SelectItem>
            <SelectItem value="error">Fehler</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            <SelectItem value="invoice">Rechnung</SelectItem>
            <SelectItem value="booking">Buchung</SelectItem>
            <SelectItem value="receipt">Beleg</SelectItem>
            <SelectItem value="sync">Sync</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">{total} Einträge</span>
      </div>

      {/* Log table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-36">Zeitpunkt</TableHead>
                  <TableHead className="w-24">Level</TableHead>
                  <TableHead className="w-24">Kategorie</TableHead>
                  <TableHead>Meldung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Lade Logs...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      Keine Einträge gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((entry) => <LogRow key={entry.id} entry={entry} />)
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} von {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(offset - limit)}
              disabled={offset === 0}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(offset + limit)}
              disabled={offset + limit >= total}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
