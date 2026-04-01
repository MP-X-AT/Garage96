import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import type { RowDataPacket } from "mysql2/promise";
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

    const orderId = Number(body.orderId);
    const forceSave = Boolean(body.forceSave);

    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "orderId ist erforderlich." },
        { status: 400 }
      );
    }

    const customerName =
      body.customerName !== undefined
        ? String(body.customerName || "").trim()
        : undefined;

    const phone =
      body.phone !== undefined ? String(body.phone || "").trim() : undefined;

    const email =
      body.email !== undefined ? String(body.email || "").trim() : undefined;

    const title =
      body.title !== undefined ? String(body.title || "").trim() : undefined;

    const vehicleInfo =
      body.vehicleInfo !== undefined
        ? String(body.vehicleInfo || "").trim()
        : undefined;

    const licensePlate =
      body.licensePlate !== undefined
        ? String(body.licensePlate || "").trim()
        : undefined;

    const notes =
      body.notes !== undefined ? String(body.notes || "").trim() : undefined;

    const price =
      body.price !== undefined
        ? body.price === null || body.price === ""
          ? null
          : Number(body.price)
        : undefined;

    const userId =
      body.userId !== undefined &&
      body.userId !== null &&
      body.userId !== ""
        ? Number(body.userId)
        : null;

    const taskTypeId =
      body.taskTypeId !== undefined &&
      body.taskTypeId !== null &&
      body.taskTypeId !== ""
        ? Number(body.taskTypeId)
        : null;

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

    const explicitStart =
      body.start && dayjs(body.start).isValid() ? dayjs(body.start) : null;

    const shouldReschedule =
      userId !== null || taskTypeId !== null || durationMinutes !== null || explicitStart !== null;

    let plannedBlocks:
      | {
          start: string;
          end: string;
          durationMinutes: number;
        }[]
      | null = null;

    let effectiveUserId: number | null = userId;
    let effectiveDurationMinutes: number | null = durationMinutes;
    let effectiveStart = explicitStart;

    if (shouldReschedule) {
      if (effectiveUserId == null) {
        const [assignmentRows] = await connection.query<
          (RowDataPacket & { user_id: number })[]
        >(
          `
            SELECT user_id
            FROM order_assignments
            WHERE order_id = ? AND is_primary = 1
            LIMIT 1
          `,
          [orderId]
        );

        if (!assignmentRows.length || !assignmentRows[0].user_id) {
          return NextResponse.json(
            { success: false, error: "Bitte Mitarbeiter:in auswählen." },
            { status: 400 }
          );
        }

        effectiveUserId = Number(assignmentRows[0].user_id);
      }

      if (
        effectiveDurationMinutes == null ||
        Number.isNaN(effectiveDurationMinutes) ||
        effectiveDurationMinutes <= 0
      ) {
        const [durationRows] = await connection.query<
          (RowDataPacket & { estimated_duration_minutes: number | null })[]
        >(
          `
            SELECT estimated_duration_minutes
            FROM orders
            WHERE id = ?
            LIMIT 1
          `,
          [orderId]
        );

        effectiveDurationMinutes = Number(
          durationRows[0]?.estimated_duration_minutes ?? 0
        );
      }

      if (
        effectiveDurationMinutes == null ||
        Number.isNaN(effectiveDurationMinutes) ||
        effectiveDurationMinutes <= 0
      ) {
        return NextResponse.json(
          { success: false, error: "Bitte gültige Dauer angeben." },
          { status: 400 }
        );
      }

      if (!effectiveStart) {
        const [startRows] = await connection.query<
          (RowDataPacket & { block_start: string })[]
        >(
          `
            SELECT block_start
            FROM schedule_blocks
            WHERE order_id = ?
            ORDER BY block_start ASC
            LIMIT 1
          `,
          [orderId]
        );

        if (!startRows.length || !dayjs(startRows[0].block_start).isValid()) {
          return NextResponse.json(
            { success: false, error: "Gültige Startzeit ist erforderlich." },
            { status: 400 }
          );
        }

        effectiveStart = dayjs(startRows[0].block_start);
      }

      plannedBlocks = await splitIntoWorkingBlocks(
        connection,
        effectiveStart.format("YYYY-MM-DD HH:mm:ss"),
        effectiveDurationMinutes
      );

      const existing = (await getExistingBlocksForUserFromDate(
        connection,
        effectiveUserId,
        effectiveStart.format("YYYY-MM-DD"),
        orderId
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
    }

    await connection.beginTransaction();

    if (
      title !== undefined ||
      vehicleInfo !== undefined ||
      licensePlate !== undefined ||
      price !== undefined ||
      notes !== undefined
    ) {
      await connection.query(
        `
          UPDATE orders
          SET
            title = COALESCE(?, title),
            vehicle_info = COALESCE(?, vehicle_info),
            license_plate = COALESCE(?, license_plate),
            price = ?,
            notes = ?
          WHERE id = ?
        `,
        [
          title ?? null,
          vehicleInfo ?? null,
          licensePlate ?? null,
          price !== undefined ? price : null,
          notes !== undefined ? notes : null,
          orderId,
        ]
      );
    }

    if (customerName !== undefined || phone !== undefined || email !== undefined) {
      await connection.query(
        `
          UPDATE customers c
          JOIN orders o ON o.customer_id = c.id
          SET
            c.name = COALESCE(?, c.name),
            c.phone = ?,
            c.email = ?
          WHERE o.id = ?
        `,
        [
          customerName ?? null,
          phone !== undefined ? phone || null : null,
          email !== undefined ? email || null : null,
          orderId,
        ]
      );
    }

    if (taskTypeId !== null) {
      await connection.query(`DELETE FROM order_task_types WHERE order_id = ?`, [
        orderId,
      ]);

      await connection.query(
        `
          INSERT INTO order_task_types (order_id, task_type_id, estimated_duration_minutes, notes)
          VALUES (?, ?, ?, NULL)
        `,
        [
          orderId,
          taskTypeId,
          effectiveDurationMinutes ?? (
            await (async () => {
              const [rows] = await connection.query<
                (RowDataPacket & { estimated_duration_minutes: number | null })[]
              >(
                `
                  SELECT estimated_duration_minutes
                  FROM orders
                  WHERE id = ?
                  LIMIT 1
                `,
                [orderId]
              );
              return Number(rows[0]?.estimated_duration_minutes ?? 0);
            })()
          ),
        ]
      );
    }

    if (shouldReschedule && plannedBlocks && effectiveUserId && effectiveDurationMinutes) {
      await connection.query(`DELETE FROM schedule_blocks WHERE order_id = ?`, [orderId]);

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
            effectiveUserId,
            taskTypeId ?? null,
            block.start,
            block.end,
            notes ?? null,
          ]
        );
      }

      await connection.query(
        `
          UPDATE order_assignments
          SET is_primary = CASE WHEN user_id = ? THEN 1 ELSE 0 END
          WHERE order_id = ?
        `,
        [effectiveUserId, orderId]
      );

      const [assignmentRows] = await connection.query<
        (RowDataPacket & { cnt: number })[]
      >(
        `
          SELECT COUNT(*) AS cnt
          FROM order_assignments
          WHERE order_id = ? AND user_id = ?
        `,
        [orderId, effectiveUserId]
      );

      if (!assignmentRows[0] || assignmentRows[0].cnt === 0) {
        await connection.query(
          `
            INSERT INTO order_assignments (order_id, user_id, role_label, is_primary)
            VALUES (?, ?, 'zuständig', 1)
          `,
          [orderId, effectiveUserId]
        );
      }
    }

    await syncOrderPlanningFields(connection, orderId);
    await connection.commit();

    return NextResponse.json({
      success: true,
      warning:
        shouldReschedule && plannedBlocks
          ? "Änderung gespeichert."
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