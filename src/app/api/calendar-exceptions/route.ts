import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = `
      SELECT
        id,
        exception_date,
        exception_type,
        name,
        is_working_day,
        start_time,
        end_time,
        notes,
        created_at,
        updated_at
      FROM calendar_exceptions
    `;
    const params: (string | number)[] = [];

    if (from && to) {
      query += ` WHERE exception_date BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      query += ` WHERE exception_date >= ?`;
      params.push(from);
    } else if (to) {
      query += ` WHERE exception_date <= ?`;
      params.push(to);
    }

    query += ` ORDER BY exception_date ASC`;

    const [rows] = await connection.query<RowDataPacket[]>(query, params);

    return NextResponse.json({
      success: true,
      exceptions: rows,
    });
  } catch (error) {
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

export async function POST(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await req.json();

    const exceptionDate = String(body.exceptionDate || "").trim();
    const exceptionType = String(body.exceptionType || "holiday").trim();
    const name = String(body.name || "").trim();
    const isWorkingDay = Number(body.isWorkingDay ? 1 : 0);
    const startTime =
      body.startTime !== undefined && body.startTime !== null && body.startTime !== ""
        ? String(body.startTime).trim()
        : null;
    const endTime =
      body.endTime !== undefined && body.endTime !== null && body.endTime !== ""
        ? String(body.endTime).trim()
        : null;
    const notes =
      body.notes !== undefined && body.notes !== null && body.notes !== ""
        ? String(body.notes).trim()
        : null;

    if (!dayjs(exceptionDate, "YYYY-MM-DD", true).isValid()) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Datum." },
        { status: 400 }
      );
    }

    if (!["holiday", "closed", "custom_hours"].includes(exceptionType)) {
      return NextResponse.json(
        { success: false, error: "Ungültiger Ausnahme-Typ." },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name ist erforderlich." },
        { status: 400 }
      );
    }

    if (isWorkingDay === 1 && (!startTime || !endTime)) {
      return NextResponse.json(
        {
          success: false,
          error: "Für Arbeitstage mit Ausnahme sind Start- und Endzeit erforderlich.",
        },
        { status: 400 }
      );
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO calendar_exceptions (
          exception_date,
          exception_type,
          name,
          is_working_day,
          start_time,
          end_time,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          exception_type = VALUES(exception_type),
          name = VALUES(name),
          is_working_day = VALUES(is_working_day),
          start_time = VALUES(start_time),
          end_time = VALUES(end_time),
          notes = VALUES(notes)
      `,
      [
        exceptionDate,
        exceptionType,
        name,
        isWorkingDay,
        startTime,
        endTime,
        notes,
      ]
    );

    return NextResponse.json({
      success: true,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
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