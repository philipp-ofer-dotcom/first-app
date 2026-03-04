import { createClient } from "@supabase/supabase-js"

type LogLevel = "info" | "warning" | "error"
type LogCategory = "invoice" | "booking" | "receipt" | "sync" | "webhook" | "transfer" | "system"

interface LogEntry {
  level: LogLevel
  category: LogCategory
  action: string
  entityType?: string
  entityId?: string
  message: string
  details?: Record<string, unknown>
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    const supabase = getServiceSupabase()
    if (!supabase) return

    await supabase.from("system_logs").insert({
      level: entry.level,
      category: entry.category,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      message: entry.message,
      details: entry.details ?? null,
    })
  } catch {
    // Never throw from logger — just silently fail
    console.error("[logger] Failed to write log entry:", entry.message)
  }
}

export const logger = {
  info: (category: LogCategory, action: string, message: string, opts?: Omit<LogEntry, "level" | "category" | "action" | "message">) =>
    log({ level: "info", category, action, message, ...opts }),

  warn: (category: LogCategory, action: string, message: string, opts?: Omit<LogEntry, "level" | "category" | "action" | "message">) =>
    log({ level: "warning", category, action, message, ...opts }),

  error: (category: LogCategory, action: string, message: string, opts?: Omit<LogEntry, "level" | "category" | "action" | "message">) =>
    log({ level: "error", category, action, message, ...opts }),
}
