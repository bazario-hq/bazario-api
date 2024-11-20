import type { Request } from 'express';
import { db } from '../db/index.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(req: Request | null, entry: AuditEntry) {
  await db
    .insertInto('audit_log')
    .values({
      actor_id: req?.user?.id ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId == null ? null : String(entry.entityId),
      metadata: JSON.stringify(entry.metadata ?? {}),
      ip: req?.ip ?? null,
    })
    .execute();
}
