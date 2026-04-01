import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { rescheduleOrder } from "@/lib/scheduling";

export async function POST(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await req.json();

    const orderId = Number(body.orderId);

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

    const date =
      body.date !== undefined && body.date !== null && body.date !== ""
        ? String(body.date)
        : null;

    const startHour =
      body.startHour !== undefined &&
      body.startHour !== null &&
      body.startHour !== ""
        ? Number(body.startHour)
        : null;

    const explicitStart =
      body.start && dayjs(body.start).isValid() ? dayjs(body.start) : null;

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

    const shouldReschedule =
      userId !== null ||
      taskTypeId !== null ||
      durationMinutes !== null ||
      (date !== null && startHour !== null) ||
      explicitStart !== null;

    if (shouldReschedule) {
      let effectiveUserId = userId;
      let effectiveDurationMinutes = durationMinutes;
      let effectiveStart = explicitStart;

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
          await connection.rollback();
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
        await connection.rollback();
        return NextResponse.json(
          { success: false, error: "Bitte gültige Dauer angeben." },
          { status: 400 }
        );
      }

      if (!effectiveStart) {
        if (
          date &&
          dayjs(date, "YYYY-MM-DD", true).isValid() &&
          startHour !== null &&
          !Number.isNaN(startHour)
        ) {
          effectiveStart = dayjs(
            `${date} ${String(startHour).padStart(2, "0")}:00:00`
          );
        } else {
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
            await connection.rollback();
            return NextResponse.json(
              { success: false, error: "Ungültiges Datum." },
              { status: 400 }
            );
          }

          effectiveStart = dayjs(startRows[0].block_start);
        }
      }

      const safeUserId: number = effectiveUserId;
      const safeDurationMinutes: number = effectiveDurationMinutes;

      await rescheduleOrder(connection, {
        orderId,
        userId: safeUserId,
        taskTypeId: taskTypeId ?? undefined,
        start: effectiveStart.format("YYYY-MM-DD HH:mm:ss"),
        durationMinutes: safeDurationMinutes,
        notes: notes ?? null,
      });
    } else if (taskTypeId !== null) {
      await connection.query(`DELETE FROM order_task_types WHERE order_id = ?`, [
        orderId,
      ]);

      await connection.query(
        `
          INSERT INTO order_task_types (order_id, task_type_id, estimated_duration_minutes, notes)
          VALUES (
            ?,
            ?,
            (SELECT estimated_duration_minutes FROM orders WHERE id = ?),
            NULL
          )
        `,
        [orderId, taskTypeId, orderId]
      );
    }

    await connection.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    await connection.rollback();

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