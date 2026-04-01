import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAustriaStyriaCalendarSeeds } from "@/lib/austria-holidays";

export async function POST(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await req.json();
    const year = Number(body.year);

    if (!year || Number.isNaN(year) || year < 2020 || year > 2100) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Jahr." },
        { status: 400 }
      );
    }

    const seeds = buildAustriaStyriaCalendarSeeds(year);

    await connection.beginTransaction();

    for (const item of seeds) {
      await connection.query(
        `
          INSERT INTO calendar_exceptions (
            exception_date,
            exception_type,
            name,
            is_working_day,
            display_only,
            start_time,
            end_time,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            exception_type = VALUES(exception_type),
            name = VALUES(name),
            is_working_day = VALUES(is_working_day),
            display_only = VALUES(display_only),
            start_time = VALUES(start_time),
            end_time = VALUES(end_time),
            notes = VALUES(notes)
        `,
        [
          item.exceptionDate,
          item.exceptionType,
          item.name,
          item.isWorkingDay ? 1 : 0,
          item.displayOnly ? 1 : 0,
          item.startTime,
          item.endTime,
          item.notes,
        ]
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      imported: seeds.length,
      blockedDays: seeds.filter((x) => !x.displayOnly && x.isWorkingDay === false).length,
      infoDays: seeds.filter((x) => x.displayOnly).length,
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