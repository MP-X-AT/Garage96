import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import { db } from "@/lib/db";

type BlockRow = {
  id: number;
  user_id: number;
  block_start: string | Date;
  block_end: string | Date;
};

type ExceptionRow = {
  exception_date: string | Date;
  exception_type: "holiday" | "closed" | "custom_hours" | "info";
  is_working_day: number;
  display_only: number;
};

type WorkingHourRow = {
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: number;
};

function mysqlTimeToMinutes(value: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

async function findTargetStart(params: {
  userId: number;
  originalStart: dayjs.Dayjs;
  durationMinutes: number;
  targetMonth: string;
}) {
  const monthStart = dayjs(params.targetMonth).startOf("month");
  const monthEnd = dayjs(params.targetMonth).endOf("month");

  const [workingHoursRows] = await db.query(
    `
      SELECT weekday, start_time, end_time, is_working_day
      FROM working_hours
    `
  );

  const [exceptionRows] = await db.query(
    `
      SELECT exception_date, exception_type, is_working_day, display_only
      FROM calendar_exceptions
      WHERE exception_date >= ?
        AND exception_date <= ?
    `,
    [monthStart.format("YYYY-MM-DD"), monthEnd.format("YYYY-MM-DD")]
  );

  const workingHours = workingHoursRows as WorkingHourRow[];
  const exceptions = exceptionRows as ExceptionRow[];

  const weekdayMap = new Map<number, WorkingHourRow>();
  for (const row of workingHours) {
    weekdayMap.set(Number(row.weekday), row);
  }

  const exceptionMap = new Map<string, ExceptionRow>();
  for (const row of exceptions) {
    const key = dayjs(row.exception_date).format("YYYY-MM-DD");
    exceptionMap.set(key, row);
  }

  const startMinutes =
    params.originalStart.hour() * 60 + params.originalStart.minute();

  for (
    let cursor = monthStart.startOf("day");
    cursor.isBefore(monthEnd) || cursor.isSame(monthEnd, "day");
    cursor = cursor.add(1, "day")
  ) {
    const weekday = cursor.isoWeekday(); // 1=Mo ... 7=So
    const working = weekdayMap.get(weekday);

    if (!working || Number(working.is_working_day) !== 1) continue;

    const exception = exceptionMap.get(cursor.format("YYYY-MM-DD"));
    if (
      exception &&
      !(Number(exception.display_only) === 1 || exception.exception_type === "info") &&
      Number(exception.is_working_day) !== 1
    ) {
      continue;
    }

    const workStartMinutes = mysqlTimeToMinutes(working.start_time);
    const workEndMinutes = mysqlTimeToMinutes(working.end_time);
    if (workStartMinutes === null || workEndMinutes === null) continue;

    if (startMinutes < workStartMinutes) continue;
    if (startMinutes + params.durationMinutes > workEndMinutes) continue;

    const candidateStart = cursor
      .hour(params.originalStart.hour())
      .minute(params.originalStart.minute())
      .second(params.originalStart.second());

    const candidateEnd = candidateStart.add(params.durationMinutes, "minute");

    const [conflicts] = await db.query(
      `
        SELECT id
        FROM schedule_blocks
        WHERE user_id = ?
          AND block_start < ?
          AND block_end > ?
        LIMIT 1
      `,
      [
        params.userId,
        candidateEnd.format("YYYY-MM-DD HH:mm:ss"),
        candidateStart.format("YYYY-MM-DD HH:mm:ss"),
      ]
    );

    const conflictRows = conflicts as { id: number }[];
    if (conflictRows.length > 0) continue;

    return candidateStart;
  }

  throw new Error("Im Zielmonat wurde kein passender freier Arbeitstag gefunden.");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const blockId = Number(body.blockId);
    const targetMonth = String(body.targetMonth ?? "");
    const userId = Number(body.userId);

    if (!blockId || !targetMonth || !userId) {
      return NextResponse.json(
        { success: false, error: "Ungültige Anfrage." },
        { status: 400 }
      );
    }

    const [rows] = await db.query(
      `
        SELECT id, user_id, block_start, block_end
        FROM schedule_blocks
        WHERE id = ?
        LIMIT 1
      `,
      [blockId]
    );

    const blocks = rows as BlockRow[];
    if (blocks.length === 0) {
      return NextResponse.json(
        { success: false, error: "Block nicht gefunden." },
        { status: 404 }
      );
    }

    const block = blocks[0];
    const originalStart = dayjs(block.block_start);
    const originalEnd = dayjs(block.block_end);
    const durationMinutes = originalEnd.diff(originalStart, "minute");

    if (durationMinutes <= 0) {
      return NextResponse.json(
        { success: false, error: "Ungültige Blockdauer." },
        { status: 400 }
      );
    }

    const newStart = await findTargetStart({
      userId,
      originalStart,
      durationMinutes,
      targetMonth,
    });

    const newEnd = newStart.add(durationMinutes, "minute");

    await db.query(
      `
        UPDATE schedule_blocks
        SET user_id = ?,
            block_start = ?,
            block_end = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        userId,
        newStart.format("YYYY-MM-DD HH:mm:ss"),
        newEnd.format("YYYY-MM-DD HH:mm:ss"),
        blockId,
      ]
    );

    return NextResponse.json({
      success: true,
      newStart: newStart.format("YYYY-MM-DD HH:mm:ss"),
      newEnd: newEnd.format("YYYY-MM-DD HH:mm:ss"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Verschieben fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}