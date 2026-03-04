"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Upload, Trash2, Eye, RefreshCw, Download, Loader2, Terminal,
  SendToBack, CheckSquare, Square, AlertCircle,
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
  CardDescription,
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
import { Alert, AlertDescription } from "@/components/ui/alert"

import type { Receipt, ReceiptPlatform, ReceiptStatus } from "@/lib/types"

// -- Helpers ------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

const PLATFORM_LABELS: Record<ReceiptPlatform, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  smoobu: "Smoobu",
  manual: "Manuell",
}

const STATUS_MAP: Record<ReceiptStatus, { label: string; className: string }> = {
  pending: { label: "Ausstehend", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400" },
  downloading: { label: "Wird geladen", className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400" },
  downloaded: { label: "Heruntergeladen", className: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400" },
  error: { label: "Fehler", className: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400" },
  transferred: { label: "In Lexware", className: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400" },
}

type TabFilter = "all" | ReceiptPlatform

function canTransfer(status: ReceiptStatus): boolean {
  return status === "downloaded" || status === "error"
}

// -- Component ----------------------------------------------------------------

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabFilter>("all")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)

  const fetchReceipts = useCallback(async () => {
    setIsLoading(true)
    try {
      const url = activeTab === "all" ? "/api/receipts" : `/api/receipts?platform=${activeTab}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setReceipts(json.receipts ?? [])
      setSelectedIds(new Set())
    } catch {
      setReceipts([])
    } finally {
      setIsLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/receipts/${id}`, { method: "DELETE" })
      await fetchReceipts()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleView(id: string) {
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

  async function handleTransferSingle(id: string) {
    setTransferringId(id)
    try {
      const res = await fetch(`/api/receipts/${id}/transfer`, { method: "POST" })
      if (!res.ok) {
        const { error } = await res.json()
        alert(`Fehler: ${error}`)
      }
      await fetchReceipts()
    } finally {
      setTransferringId(null)
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
    })
    await fetchReceipts()
  }

  const filteredReceipts =
    activeTab === "all" ? receipts : receipts.filter((r) => r.platform === activeTab)

  const transferableInView = filteredReceipts.filter((r) => canTransfer(r.status))
  const allSelected =
    transferableInView.length > 0 &&
    transferableInView.every((r) => selectedIds.has(r.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        transferableInView.forEach((r) => next.delete(r.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        transferableInView.forEach((r) => next.add(r.id))
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

  const counts = {
    all: receipts.length,
    airbnb: receipts.filter((r) => r.platform === "airbnb").length,
    booking: receipts.filter((r) => r.platform === "booking").length,
    manual: receipts.filter((r) => r.platform === "manual" || r.platform === "smoobu").length,
  }

  const selectedTransferable = Array.from(selectedIds).filter((id) => {
    const r = receipts.find((r) => r.id === id)
    return r && canTransfer(r.status)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Belege</h1>
          <p className="text-sm text-muted-foreground">
            Buchungsbelege von Airbnb und Booking.com verwalten
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedTransferable.length > 0 && (
            <Dialog open={batchOpen} onOpenChange={(v) => { setBatchOpen(v); if (!v) setBatchProgress(null) }}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <SendToBack className="mr-2 h-4 w-4" />
                  {selectedTransferable.length} zu Lexware
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>Belege zu Lexware uebertragen</DialogTitle>
                  <DialogDescription>
                    {selectedTransferable.length} {selectedTransferable.length === 1 ? "Beleg wird" : "Belege werden"} als Voucher in Lexware Office erstellt.
                  </DialogDescription>
                </DialogHeader>
                {batchProgress && (
                  <div className="space-y-3 py-2">
                    <Progress
                      value={batchProgress.total > 0 ? (batchProgress.done + batchProgress.failed) / batchProgress.total * 100 : 0}
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{batchProgress.done} erfolgreich</span>
                      {batchProgress.failed > 0 && (
                        <span className="text-destructive">{batchProgress.failed} fehlgeschlagen</span>
                      )}
                      <span>{batchProgress.total} gesamt</span>
                    </div>
                    {!batchProgress.running && (
                      <p className="text-sm text-center font-medium">
                        {batchProgress.failed === 0
                          ? "Alle Belege erfolgreich uebertragen!"
                          : `${batchProgress.done} von ${batchProgress.total} uebertragen.`}
                      </p>
                    )}
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
          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onSuccess={fetchReceipts}
          />
          <Button variant="outline" onClick={fetchReceipts} aria-label="Aktualisieren">
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Airbnb automation info */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Automatischer Airbnb-Download (lokales Script)
          </CardTitle>
          <CardDescription>
            Playwright laeuft lokal auf deinem Rechner und schickt PDFs automatisch an die App.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 text-sm">
            <p className="font-mono bg-muted rounded px-2 py-1 text-xs">
              node scripts/airbnb-receipt.js --booking HMXXXXXXXXXX
            </p>
            <p className="text-xs text-muted-foreground">
              Script liegt unter <code>scripts/airbnb-receipt.js</code>.
              Setup-Anleitung: <code>scripts/README.md</code>.
              Zugangsdaten unter Einstellungen → Integrationen hinterlegen.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
        <TabsList>
          <TabsTrigger value="all">Alle ({counts.all})</TabsTrigger>
          <TabsTrigger value="airbnb">Airbnb ({counts.airbnb})</TabsTrigger>
          <TabsTrigger value="booking">Booking.com ({counts.booking})</TabsTrigger>
          <TabsTrigger value="manual">Manuell ({counts.manual})</TabsTrigger>
        </TabsList>

        {(["all", "airbnb", "booking", "manual"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {isLoading ? (
              <LoadingSkeleton />
            ) : filteredReceipts.length === 0 ? (
              <EmptyState platform={tab} onUpload={() => setUploadOpen(true)} />
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
                            aria-label="Alle auswaehlen"
                            disabled={transferableInView.length === 0}
                          />
                        </TableHead>
                        <TableHead>Plattform</TableHead>
                        <TableHead>Buchungsreferenz</TableHead>
                        <TableHead className="hidden md:table-cell">Gast / Objekt</TableHead>
                        <TableHead className="hidden lg:table-cell">Datum</TableHead>
                        <TableHead className="hidden lg:table-cell">Betrag</TableHead>
                        <TableHead className="hidden sm:table-cell">Datei</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReceipts.map((receipt) => {
                        const isTransferable = canTransfer(receipt.status)
                        const isSelected = selectedIds.has(receipt.id)
                        return (
                          <TableRow key={receipt.id} className={isSelected ? "bg-muted/50" : ""}>
                            <TableCell>
                              {isTransferable ? (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(receipt.id)}
                                  aria-label={`${receipt.bookingReference ?? receipt.id} auswaehlen`}
                                />
                              ) : (
                                <div className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell>
                              <PlatformBadge platform={receipt.platform} />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {receipt.bookingReference ?? "—"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {receipt.booking ? (
                                <div>
                                  <p className="font-medium text-foreground">{receipt.booking.guestName}</p>
                                  <p className="text-xs">{receipt.booking.propertyName}</p>
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">
                              {formatDate(receipt.receiptDate)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">
                              {formatCurrency(receipt.amount)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {receipt.fileName ? (
                                <div>
                                  <p className="truncate max-w-[120px]" title={receipt.fileName}>
                                    {receipt.fileName}
                                  </p>
                                  <p className="text-xs">{formatFileSize(receipt.fileSizeBytes)}</p>
                                </div>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={receipt.status} errorMessage={receipt.errorMessage} />
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
                                        onClick={() => handleTransferSingle(receipt.id)}
                                        disabled={transferringId === receipt.id}
                                      >
                                        {transferringId === receipt.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <SendToBack className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Zu Lexware uebertragen</TooltipContent>
                                  </Tooltip>
                                )}
                                {(receipt.status === "downloaded" || receipt.status === "transferred") && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                        onClick={() => handleView(receipt.id)}
                                        disabled={viewingId === receipt.id}
                                      >
                                        {viewingId === receipt.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Eye className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Beleg anzeigen</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDelete(receipt.id)}
                                      disabled={deletingId === receipt.id}
                                    >
                                      {deletingId === receipt.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Beleg loeschen</TooltipContent>
                                </Tooltip>
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
        ))}
      </Tabs>
    </div>
  )
}

// -- Types --------------------------------------------------------------------

interface BatchProgress {
  total: number
  done: number
  failed: number
  running: boolean
}

// -- Platform Badge -----------------------------------------------------------

function PlatformBadge({ platform }: { platform: ReceiptPlatform }) {
  const colors: Record<ReceiptPlatform, string> = {
    airbnb: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-400",
    booking: "bg-blue-600/15 text-blue-700 border-blue-600/30 dark:text-blue-400",
    smoobu: "bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-400",
    manual: "bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400",
  }
  return (
    <Badge variant="outline" className={`text-xs ${colors[platform]}`}>
      {PLATFORM_LABELS[platform]}
    </Badge>
  )
}

// -- Status Badge -------------------------------------------------------------

function StatusBadge({ status, errorMessage }: { status: ReceiptStatus; errorMessage: string | null }) {
  const info = STATUS_MAP[status]
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-xs cursor-default ${info.className}`}>
            {info.label}
          </Badge>
        </TooltipTrigger>
        {errorMessage && (
          <TooltipContent className="max-w-xs">
            <p className="text-xs">{errorMessage}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

// -- Upload Dialog ------------------------------------------------------------

function UploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const [platform, setPlatform] = useState<string>("airbnb")
  const [bookingReference, setBookingReference] = useState("")
  const [receiptDate, setReceiptDate] = useState("")
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPlatform("airbnb")
    setBookingReference("")
    setReceiptDate("")
    setAmount("")
    setNotes("")
    setFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleUpload() {
    if (!file) { setError("Bitte eine Datei auswaehlen"); return }
    setIsUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("platform", platform)
      if (bookingReference) fd.append("bookingReference", bookingReference)
      if (receiptDate) fd.append("receiptDate", receiptDate)
      if (amount) fd.append("amount", amount)
      if (notes) fd.append("notes", notes)

      const res = await fetch("/api/receipts/upload", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Upload fehlgeschlagen"); return }
      onSuccess()
      onOpenChange(false)
      reset()
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Beleg hochladen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Beleg hochladen</DialogTitle>
          <DialogDescription>
            PDF, JPEG oder PNG — max. 20 MB
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Plattform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="smoobu">Smoobu</SelectItem>
                  <SelectItem value="manual">Manuell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-ref">Buchungsreferenz</Label>
              <Input
                id="upload-ref"
                placeholder="z.B. HMXXXXXXXX"
                value={bookingReference}
                onChange={(e) => setBookingReference(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="upload-date">Belegdatum</Label>
              <Input
                id="upload-date"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-amount">Betrag (EUR)</Label>
              <Input
                id="upload-amount"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-notes">Notizen</Label>
            <Input
              id="upload-notes"
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-file">Datei *</Label>
            <Input
              id="upload-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              ref={fileInputRef}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {formatFileSize(file.size)}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
            Abbrechen
          </Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading ? "Wird hochgeladen..." : "Hochladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -- Loading / Empty ----------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {["", "Plattform", "Referenz", "Gast / Objekt", "Datum", "Status", "Aktionen"].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
              <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-16" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyState({ platform, onUpload }: { platform: string; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-16 text-center">
      <Download className="mb-4 h-10 w-10 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Keine Belege vorhanden</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {platform === "all"
          ? "Noch keine Belege hochgeladen oder heruntergeladen."
          : `Keine ${platform === "airbnb" ? "Airbnb" : platform === "booking" ? "Booking.com" : "manuellen"} Belege gefunden.`}
      </p>
      <Button className="mt-4" onClick={onUpload}>
        <Upload className="mr-2 h-4 w-4" />
        Beleg hochladen
      </Button>
    </div>
  )
}
