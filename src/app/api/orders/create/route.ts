import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  getExistingBlocksForUserFromDate,
  overlaps,
  splitIntoWorkingBlocks,
  syncOrderPlanningFields,
} from "@/lib/scheduling";

type ExistingBusyBlock = {
  id: number;
  orderId: number;
  userId: number;
  taskTypeId: number | null;
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
  status: "geplant" | "in_arbeit" | "pausiert" | "erledigt";
  source: "manual" | "auto";
  notes: string | null;
};

function buildConflictPayload(
  plannedBlocks: { start: string; end: string }[],
  existing: ExistingBusyBlock[]
) {
  const conflicts: { start: string; end: string; orderId?: number }[] = [];

  for (const block of plannedBlocks) {
    const plannedStart = dayjs(block.start);
    const plannedEnd = dayjs(block.end);

    for (const busy of existing) {
      if (overlaps(plannedStart, plannedEnd, busy.start, busy.end)) {
        conflicts.push({
          start: busy.start.format("YYYY-MM-DD HH:mm:ss"),
          end: busy.end.format("YYYY-MM-DD HH:mm:ss"),
          orderId: busy.orderId,
        });
      }
    }
  }

  const unique = new Map<string, { start: string; end: string; orderId?: number }>();
  for (const item of conflicts) {
    unique.set(`${item.start}-${item.end}-${item.orderId ?? ""}`, item);
  }

  return Array.from(unique.values());
}

export async function POST(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await req.json();

    const customerName = String(body.customerName || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    let title = String(body.title || "").trim();
    const vehicleInfo = String(body.vehicleInfo || "").trim();
    const licensePlate = String(body.licensePlate || "").trim();
    const notes = String(body.notes || "").trim();
    const forceSave = Boolean(body.forceSave);

    const price =
      body.price !== undefined && body.price !== null && body.price !== ""
        ? Number(body.price)
        : null;

    const userId = Number(body.userId);
    const taskTypeId = Number(body.taskTypeId);

    const durationMinutes =
      body.durationMinutes !== undefined &&
      body.durationMinutes !== null &&
      body.durationMinutes !== ""
        ? Number(body.durationMinutes)
        : body.durationHours !== undefined &&
          body.durationHours !== null &&
          body.durationHours !== ""
        ? Number(body.durationHours) * 60
        : null;

    const date = String(body.date || "").trim();
    const startRaw = String(body.start || "").trim();

    if (!customerName) {
      return NextResponse.json(
        { success: false, error: "Kund:in ist erforderlich." },
        { status: 400 }
      );
    }

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "Mitarbeiter:in ist erforderlich." },
        { status: 400 }
      );
    }

    if (!taskTypeId || Number.isNaN(taskTypeId)) {
      return NextResponse.json(
        { success: false, error: "Arbeitsart ist erforderlich." },
        { status: 400 }
      );
    }

    if (!durationMinutes || durationMinutes <= 0 || Number.isNaN(durationMinutes)) {
      return NextResponse.json(
        { success: false, error: "Gültige Dauer ist erforderlich." },
        { status: 400 }
      );
    }

    if (!date || !dayjs(date, "YYYY-MM-DD", true).isValid()) {
      return NextResponse.json(
        { success: false, error: "Gültiges Datum ist erforderlich." },
        { status: 400 }
      );
    }

    if (!startRaw || !dayjs(startRaw).isValid()) {
      return NextResponse.json(
        { success: false, error: "Gültige Startzeit ist erforderlich." },
        { status: 400 }
      );
    }

    if (!title) {
      const [taskTypeRows] = await connection.query<(RowDataPacket & { name: string })[]>(
        `
          SELECT name
          FROM task_types
          WHERE id = ?
          LIMIT 1
        `,
        [taskTypeId]
      );

      title = taskTypeRows[0]?.name?.trim() || "Auftrag";
    }

    const start = dayjs(startRaw).format("YYYY-MM-DD HH:mm:ss");
    const plannedBlocks = await splitIntoWorkingBlocks(connection, start, durationMinutes);

    const existing = (await getExistingBlocksForUserFromDate(
      connection,
      userId,
      dayjs(start).format("YYYY-MM-DD")
    )) as ExistingBusyBlock[];

    const conflicts = buildConflictPayload(plannedBlocks, existing);

    if (conflicts.length > 0 && !forceSave) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          warning:
            "Für diese Person gibt es im gewählten Zeitraum bereits geplante Blöcke.",
          conflicts,
          plannedBlocks,
        },
        { status: 409 }
      );
    }

    await connection.beginTransaction();

    let customerId: number;

    const [customerRows] = await connection.query<
      (RowDataPacket & { id: number })[]
    >(
      `
        SELECT id
        FROM customers
        WHERE name = ?
          AND (
            (phone = ?)
            OR (phone IS NULL AND ? = '')
            OR (? = '' AND phone IS NULL)
          )
        LIMIT 1
      `,
      [customerName, phone || null, phone, phone]
    );

    if (customerRows.length > 0) {
      customerId = customerRows[0].id;

      await connection.query(
        `
          UPDATE customers
          SET
            phone = ?,
            email = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [phone || null, email || null, customerId]
      );
    } else {
      const [customerResult] = await connection.query<ResultSetHeader>(
        `
          INSERT INTO customers (name, phone, email, notes, is_active)
          VALUES (?, ?, ?, NULL, 1)
        `,
        [customerName, phone || null, email || null]
      );

      customerId = customerResult.insertId;
    }

    const plannedStart = plannedBlocks[0].start;
    const plannedEnd = plannedBlocks[plannedBlocks.length - 1].end;

    const [orderResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO orders (
          customer_id,
          order_number,
          title,
          vehicle_info,
          license_plate,
          price,
          currency,
          estimated_duration_minutes,
          status,
          priority,
          planned_start,
          planned_end,
          is_internal,
          notes
        ) VALUES (?, NULL, ?, ?, ?, ?, 'EUR', ?, 'geplant', 'normal', ?, ?, 0, ?)
      `,
      [
        customerId,
        title,
        vehicleInfo || null,
        licensePlate || null,
        price,
        durationMinutes,
        plannedStart,
        plannedEnd,
        notes || null,
      ]
    );

    const orderId = orderResult.insertId;

    await connection.query(
      `
        INSERT INTO order_task_types (order_id, task_type_id, estimated_duration_minutes, notes)
        VALUES (?, ?, ?, NULL)
      `,
      [orderId, taskTypeId, durationMinutes]
    );

    await connection.query(
      `
        INSERT INTO order_assignments (order_id, user_id, role_label, is_primary)
        VALUES (?, ?, 'zuständig', 1)
      `,
      [orderId, userId]
    );

    for (const block of plannedBlocks) {
      await connection.query(
        `
          INSERT INTO schedule_blocks (
            order_id,
            user_id,
            task_type_id,
            block_start,
            block_end,
            status,
            source,
            notes
          ) VALUES (?, ?, ?, ?, ?, 'geplant', 'manual', ?)
        `,
        [
          orderId,
          userId,
          taskTypeId,
          block.start,
          block.end,
          notes || null,
        ]
      );
    }

    await syncOrderPlanningFields(connection, orderId);
    await connection.commit();

    return NextResponse.json({
      success: true,
      orderId,
      blocks: plannedBlocks,
      warning:
        conflicts.length > 0
          ? "Es gab Planungskonflikte, der Auftrag wurde aber bewusst gespeichert."
          : null,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}

    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}