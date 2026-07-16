import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Admin console — Audit-log reader.
 *
 * Every admin mutation writes a row into `admin_action_logs`. Historically
 * nothing surfaced them back to operators. This endpoint exposes the log
 * with filters (targetType/targetId/adminId/actionType/from/to) and keyset
 * pagination.
 *
 * The `admin_action_logs` table schema drifted between two writers:
 *   • AdminActionLog entity — has `payload_json` + `created_at`
 *   • AdminAuditService (raw SQL) — writes `justification`, `hash_chain`,
 *     `before_state`, `after_state`, `app_recorded_at`
 *
 * We SELECT columns via `to_jsonb(row)` fallback so the query works
 * regardless of which columns are present. We only rely on the
 * always-present base columns for filtering/ordering.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller({ path: 'admin/audit-log', version: '1' })
export class AdminAuditLogController {
  private readonly logger = new Logger(AdminAuditLogController.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /* GET /v1/admin/audit-log */
  @Get()
  async list(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('adminId') adminId?: string,
    @Query('actionType') actionType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '50',
  ) {
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    // Discover which optional columns exist so we can build a compatible SELECT.
    const cols = await this.getColumns();
    const has = (c: string) => cols.has(c);

    const selectParts: string[] = [
      'l.id                             AS id',
      'l.admin_id                       AS "adminId"',
      'l.action_type                    AS "actionType"',
      'l.target_type                    AS "targetType"',
      'l.target_id                      AS "targetId"',
      'l.ip_address                     AS "ipAddress"',
      'l.created_at                     AS "createdAt"',
      'a.email                          AS "adminEmail"',
    ];

    if (has('payload_json')) {
      selectParts.push('l.payload_json                   AS "payloadJson"');
    } else {
      selectParts.push('NULL::jsonb                     AS "payloadJson"');
    }
    if (has('justification')) {
      selectParts.push('l.justification                 AS "justification"');
    } else {
      selectParts.push('NULL::text                      AS "justification"');
    }
    if (has('before_state')) {
      selectParts.push('l.before_state                  AS "beforeState"');
    } else {
      selectParts.push('NULL::jsonb                     AS "beforeState"');
    }
    if (has('after_state')) {
      selectParts.push('l.after_state                   AS "afterState"');
    } else {
      selectParts.push('NULL::jsonb                     AS "afterState"');
    }

    const where: string[] = [];
    const params: any[] = [];
    let p = 0;

    if (targetType) {
      where.push(`l.target_type = $${++p}`);
      params.push(targetType);
    }
    if (targetId) {
      where.push(`l.target_id = $${++p}`);
      params.push(targetId);
    }
    if (adminId) {
      where.push(`l.admin_id = $${++p}`);
      params.push(adminId);
    }
    if (actionType) {
      where.push(`l.action_type ILIKE $${++p}`);
      params.push(`%${actionType}%`);
    }
    if (from) {
      const fromD = new Date(from);
      if (!isNaN(fromD.getTime())) {
        where.push(`l.created_at >= $${++p}`);
        params.push(fromD);
      }
    }
    if (to) {
      const toD = new Date(to);
      if (!isNaN(toD.getTime())) {
        where.push(`l.created_at <= $${++p}`);
        params.push(toD);
      }
    }

    // Keyset cursor: base64(createdAtISO|id)
    if (cursor) {
      try {
        const raw = Buffer.from(cursor, 'base64').toString('utf8');
        const [d, i] = raw.split('|');
        if (d && i) {
          where.push(
            `(l.created_at < $${++p} OR (l.created_at = $${p} AND l.id < $${++p}))`,
          );
          params.push(new Date(d));
          params.push(i);
        }
      } catch {
        // ignore bad cursor
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT ${selectParts.join(', ')}
      FROM admin_action_logs l
      LEFT JOIN admins a ON a.id = l.admin_id
      ${whereClause}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${safeLimit + 1}
    `;

    let rows: any[] = [];
    try {
      rows = await this.ds.query(sql, params);
    } catch (err: any) {
      this.logger.error(`audit-log query failed: ${err?.message ?? err}`);
      return { items: [], nextCursor: null, hasMore: false };
    }

    const hasMore = rows.length > safeLimit;
    const items = hasMore ? rows.slice(0, safeLimit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(
          `${new Date(last.createdAt).toISOString()}|${last.id}`,
          'utf8',
        ).toString('base64')
      : null;

    // Normalise notes: prefer justification, fall back to payload_json.notes
    // so both writers surface a human string.
    const shaped = items.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminEmail: r.adminEmail ?? null,
      actionType: r.actionType,
      targetType: r.targetType,
      targetId: r.targetId,
      ipAddress: r.ipAddress ?? null,
      createdAt: r.createdAt,
      justification: r.justification ?? null,
      notes:
        r.justification ??
        (r.payloadJson && typeof r.payloadJson === 'object'
          ? (r.payloadJson.notes ?? null)
          : null),
      beforeState: r.beforeState ?? null,
      afterState: r.afterState ?? null,
      payloadJson: r.payloadJson ?? null,
    }));

    return { items: shaped, nextCursor, hasMore };
  }

  private async getColumns(): Promise<Set<string>> {
    try {
      const rows = await this.ds.query<Array<{ column_name: string }>>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'admin_action_logs'`,
      );
      return new Set(rows.map((r) => r.column_name));
    } catch {
      // Assume the minimal (entity) shape.
      return new Set([
        'id',
        'admin_id',
        'action_type',
        'target_type',
        'target_id',
        'payload_json',
        'ip_address',
        'created_at',
      ]);
    }
  }
}
