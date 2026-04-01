import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { createOrderBlocks, findNextAvailableSlot } from "@/lib/scheduling";

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

    if (!title && taskTypeId && !Number.isNaN(taskTypeId)) {
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

    let start: string;

    if (body.start && dayjs(body.start).isValid()) {
      start = dayjs(body.start).format("YYYY-MM-DD HH:mm:ss");
    } else if (
      body.startHour !== undefined &&
      body.startHour !== null &&
      body.startHour !== ""
    ) {
      const startHour = Number(body.startHour);

      if (Number.isNaN(startHour)) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, error: "Ungültige Startzeit." },
          { status: 400 }
        );
      }

      start = dayjs(
        `${date} ${String(startHour).padStart(2, "0")}:00:00`
      ).format("YYYY-MM-DD HH:mm:ss");
    } else {
      const suggestion = await findNextAvailableSlot({
        connection,
        userId,
        durationMinutes,
        startDate: date,
      });

      start = suggestion.start;
    }

    const plannedBlocksPreview = await findNextAvailableSlot({
      connection,
      userId,
      durationMinutes,
      startDate: dayjs(start).format("YYYY-MM-DD"),
    });

    const plannedStart = plannedBlocksPreview.start;
    const plannedEnd = plannedBlocksPreview.end;

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

    const blocks = await createOrderBlocks(connection, {
      orderId,
      userId,
      taskTypeId,
      start,
      durationMinutes,
      source: body.start ? "manual" : "auto",
      status: "geplant",
      notes: notes || null,
    });

    await connection.commit();

    return NextResponse.json({
      success: true,
      orderId,
      blocks,
    });
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