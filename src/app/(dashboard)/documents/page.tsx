"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Loader2, FileText, Receipt,
  SendToBack, Eye, AlertCircle, CheckCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// -- Types --------------------------------------------------------------------

interface DocumentRow {
  id: string
  type: "invoice" | "receipt"
  platform: string | null
  bookingReference: string | null
  bookingId: string | null
  guestName: string | null
  propertyName: string | null
  date: string | null
  amount: number | null
  status: string
  errorMessage: string | null
  notes: string | null
  lexwareId: string | null
  lexwareNumber: string | null
  transferredAt: string | null
  createdAt: string
  fileName: string | null
}

interface BatchProgress {
  total: number
  done: number
  failed: number
  running: boolean
  results?: { id: string; success: boolean; error?: string }[]
}

// -- Helpers ------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400",
  booking: "bg-blue-600/15 text-blue-700 border-blue-600/30 dark:text-blue-400",
  smoobu: "bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-400",
  manual: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
}

const PLATFORM_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  smoobu: "Smoobu",
  manual: "Manuell",
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
  ready: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
  creating: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
  created: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
  error: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
  skipped: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
  cancelled: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  ready: "Bereit",
  creating: "Wird erstellt",
  created: "In Lexware",
  error: "Fehler",
  skipped: "Uebersprungen",
  cancelled: "Storniert",
}

const RECEIPT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
  downloading: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
  downloaded: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
  error: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400",
  transferred: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
}

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  downloading: "Wird geladen",
  downloaded: "Heruntergeladen",
  error: "Fehler",
  transferred: "In Lexware",
}

function getStatusBadge(doc: DocumentRow) {
  const colorMap = doc.type === "invoice" ? INVOICE_STATUS_COLORS : RECEIPT_STATUS_COLORS
  const labelMap = doc.type === "invoice" ? INVOICE_STATUS_LABELS : RECEIPT_STATUS_LABELS
  return {
    color: colorMap[doc.status] ?? "bg-gray-500/15 text-gray-600",
    label: labelMap[doc.status] ?? doc.status,
  }
}

function canTransferReceipt(doc: DocumentRow): boolean {
  return doc.type === "receipt" && (doc.status === "downloaded" || doc.status === "error")
}

// -- Component ----------------------------------------------------------------

type TabValue = "all" | "invoice" | "receipt"

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>("all")
  const [platformFilter, setPlatformFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeTab !== "all") params.set("type", activeTab)
      if (platformFilter !== "all") params.set("platform", platformFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)

      const res = await fetch(`/api/documents?${params.toString()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDocuments(json.documents ?? [])
      setSelectedIds(new Set())
    } catch {
      setDocuments([])
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, platformFilter, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  async function handleExportCsv() {
    setIsExporting(true)
    try {
      const params = new URLSearchParams({ format: "csv" })
      if (activeTab !== "all") params.set("type", activeTab)
      if (platformFilter !== "all") params.set("platform", platformFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)

      const res = await fetch(`/api/documents?${params.toString()}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dokumente-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleTransferSingle(id: string) {
    setTransferringId(id)
    try {
      const res = await fetch(`/api/receipts/${id}/transfer`, { method: "POST" })
      if (!res.ok) {
        const { error } = await res.json()
        alert(`Fehler: ${error}`)
      }
      await fetchDocuments()
    } finally {
      setTransferringId(null)
    }
  }

  async function handleViewReceipt(id: string) {
    setViewingId(id)
    try {
      const res = await fetch(`/api/receipts/${id}/download`)
      if (!res.ok) return
      const { url } = await res.json()
      window.open(url, "_blank", "noopener,noreferrer")
    } finally {
      setViewingId(null)
    }
  }

  async function handleBatchTransfer() {
    const ids = Array.from(selectedIds)
    setBatchProgress({ total: ids.length, done: 0, failed: 0, running: true })

    const res = await fetch("/api/receipts/transfer-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptIds: ids }),
    })
    const json = await res.json()

    setBatchProgress({
      total: json.results?.length ?? ids.length,
      done: json.successCount ?? 0,
      failed: json.failCount ?? 0,
      running: false,
      results: json.results,
    })
    await fetchDocuments()
  }

  const transferableInView = documents.filter(canTransferReceipt)
  const allSelected =
    transferableInView.length > 0 &&
    transferableInView.every((d) => selectedIds.has(d.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        transferableInView.forEach((d) => next.delete(d.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        transferableInView.forEach((d) => next.add(d.id))
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedTransferable = Array.from(selectedIds).filter((id) => {
    const d = documents.find((d) => d.id === id)
    return d && canTransferReceipt(d)
  })

  // Summary counts
  const invoiceCount = documents.filter((d) => d.type === "invoice").length
  const receiptCount = documents.filter((d) => d.type === "receipt").length
  const pendingTransfer = documents.filter((d) => d.type === "receipt" && d.status === "downloaded").length
  const inLexware = documents.filter(
    (d) =>
      (d.type === "receipt" && d.status === "transferred") ||
      (d.type === "invoice" && d.status === "created")
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dokumente</h1>
          <p className="text-sm text-muted-foreground">
            Rechnungen und Belege – Übersicht und Lexware-Transfer
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedTransferable.length > 0 && (
            <Dialog
              open={batchOpen}
              onOpenChange={(v) => { setBatchOpen(v); if (!v) setBatchProgress(null) }}
            >
              <DialogTrigger asChild>
                <Button>
                  <SendToBack className="mr-2 h-4 w-4" />
                  {selectedTransferable.length} zu Lexware
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Belege zu Lexware uebertragen</DialogTitle>
                  <DialogDescription>
                    {selectedTransferable.length}{" "}
                    {selectedTransferable.length === 1 ? "Beleg wird" : "Belege werden"} als Voucher
                    in Lexware Office erstellt.
                  </DialogDescription>
                </DialogHeader>
                {batchProgress ? (
                  <div className="space-y-4 py-2">
                    <Progress
                      value={
                        batchProgress.total > 0
                          ? ((batchProgress.done + batchProgress.failed) / batchProgress.total) * 100
                          : 0
                      }
                    />
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600 dark:text-green-400">
                        <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                        {batchProgress.done} erfolgreich
                      </span>
                      {batchProgress.failed > 0 && (
                        <span className="text-destructive">
                          <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                          {batchProgress.failed} fehlgeschlagen
                        </span>
                      )}
                      <span className="text-muted-foreground">{batchProgress.total} gesamt</span>
                    </div>
                    {!batchProgress.running && (
                      <p className="text-sm text-center font-medium pt-1">
                        {batchProgress.failed === 0
                          ? "Alle Belege erfolgreich uebertragen!"
                          : `${batchProgress.done} von ${batchProgress.total} Belegen uebertragen.`}
                      </p>
                    )}
                    {batchProgress.running && (
                      <p className="text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uebertragung laeuft...
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-sm text-muted-foreground">
                    Alle {selectedTransferable.length} ausgewaehlten Belege werden einzeln zu Lexware
                    uebertragen (~{selectedTransferable.length * 0.5 + 5}s).
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => { setBatchOpen(false); setBatchProgress(null) }}
                    disabled={batchProgress?.running}
                  >
                    {batchProgress && !batchProgress.running ? "Schliessen" : "Abbrechen"}
                  </Button>
                  {!batchProgress && (
                    <Button onClick={handleBatchTransfer}>
                      <SendToBack className="mr-2 h-4 w-4" />
                      Jetzt uebertragen
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" onClick={handleExportCsv} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            CSV Export
          </Button>
          <Button variant="outline" onClick={fetchDocuments} aria-label="Aktualisieren">
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Rechnungen" value={invoiceCount} icon={<FileText className="h-4 w-4" />} />
        <SummaryCard label="Belege" value={receiptCount} icon={<Receipt className="h-4 w-4" />} />
        <SummaryCard label="Zu uebertragen" value={pendingTransfer} icon={<SendToBack className="h-4 w-4" />} accent="blue" />
        <SummaryCard label="In Lexware" value={inLexware} icon={<CheckCircle2 className="h-4 w-4" />} accent="green" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Plattform</Label>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="airbnb">Airbnb</SelectItem>
              <SelectItem value="booking">Booking.com</SelectItem>
              <SelectItem value="smoobu">Smoobu</SelectItem>
              <SelectItem value="manual">Manuell</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="downloaded">Heruntergeladen</SelectItem>
              <SelectItem value="transferred">In Lexware</SelectItem>
              <SelectItem value="created">Rechnung erstellt</SelectItem>
              <SelectItem value="error">Fehler</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-from" className="text-xs">Von</Label>
          <Input
            id="date-from"
            type="date"
            className="h-8 w-36 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-to" className="text-xs">Bis</Label>
          <Input
            id="date-to"
            type="date"
            className="h-8 w-36 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {(platformFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setPlatformFilter("all")
              setStatusFilter("all")
              setDateFrom("")
              setDateTo("")
            }}
          >
            Filter zuruecksetzen
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="all">Alle ({documents.length})</TabsTrigger>
          <TabsTrigger value="invoice">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Rechnungen ({invoiceCount})
          </TabsTrigger>
          <TabsTrigger value="receipt">
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            Belege ({receiptCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <DocumentsSkeleton />
          ) : documents.length === 0 ? (
            <EmptyState />
          ) : (
            <TooltipProvider>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Alle Belege auswaehlen"
                          disabled={transferableInView.length === 0}
                        />
                      </TableHead>
                      <TableHead className="w-24">Typ</TableHead>
                      <TableHead className="hidden sm:table-cell">Plattform</TableHead>
                      <TableHead>Referenz / Gast</TableHead>
                      <TableHead className="hidden md:table-cell">Objekt</TableHead>
                      <TableHead className="hidden lg:table-cell">Datum</TableHead>
                      <TableHead className="hidden lg:table-cell">Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden xl:table-cell">Lexware-Nr.</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const isTransferable = canTransferReceipt(doc)
                      const isSelected = selectedIds.has(doc.id)
                      const { color: statusColor, label: statusLabel } = getStatusBadge(doc)
                      return (
                        <TableRow key={`${doc.type}-${doc.id}`} className={isSelected ? "bg-muted/50" : ""}>
                          <TableCell>
                            {isTransferable ? (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(doc.id)}
                                aria-label={`${doc.bookingReference ?? doc.id} auswaehlen`}
                              />
                            ) : (
                              <div className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                doc.type === "invoice"
                                  ? "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-400"
                                  : "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400"
                              }`}
                            >
                              {doc.type === "invoice" ? (
                                <><FileText className="mr-1 h-3 w-3" />Rechnung</>
                              ) : (
                                <><Receipt className="mr-1 h-3 w-3" />Beleg</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {doc.platform ? (
                              <Badge
                                variant="outline"
                                className={`text-xs ${PLATFORM_COLORS[doc.platform] ?? ""}`}
                              >
                                {PLATFORM_LABELS[doc.platform] ?? doc.platform}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>
                              {doc.bookingReference && (
                                <p className="font-mono text-xs text-muted-foreground">{doc.bookingReference}</p>
                              )}
                              {doc.guestName && (
                                <p className="font-medium">{doc.guestName}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {doc.propertyName ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {formatDate(doc.date)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {formatCurrency(doc.amount)}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={`text-xs cursor-default ${statusColor}`}
                                >
                                  {statusLabel}
                                </Badge>
                              </TooltipTrigger>
                              {doc.errorMessage && (
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{doc.errorMessage}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground font-mono">
                            {doc.lexwareNumber ?? doc.lexwareId?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isTransferable && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => handleTransferSingle(doc.id)}
                                      disabled={transferringId === doc.id}
                                    >
                                      {transferringId === doc.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <SendToBack className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Zu Lexware uebertragen</TooltipContent>
                                </Tooltip>
                              )}
                              {doc.type === "receipt" &&
                                (doc.status === "downloaded" || doc.status === "transferred") && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                        onClick={() => handleViewReceipt(doc.id)}
                                        disabled={viewingId === doc.id}
                                      >
                                        {viewingId === doc.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Eye className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Beleg anzeigen</TooltipContent>
                                  </Tooltip>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// -- Summary Card -------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent?: "blue" | "green"
}) {
  const accentClass =
    accent === "blue"
      ? "text-blue-600 dark:text-blue-400"
      : accent === "green"
        ? "text-green-600 dark:text-green-400"
        : "text-foreground"
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        <p className={`text-2xl font-bold ${accentClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

// -- Skeleton / Empty ---------------------------------------------------------

function DocumentsSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {["", "Typ", "Plattform", "Referenz / Gast", "Datum", "Status", "Aktionen"].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-36" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-8" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-16 text-center">
      <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Keine Dokumente gefunden</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Passe die Filter an oder erstelle Rechnungen und lade Belege hoch.
      </p>
    </div>
  )
}
