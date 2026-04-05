import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import { db } from "@/lib/db";
import {
  moveScheduleBlockWithRules,
  getEffectiveWorkdayConfig,
} from "@/lib/scheduling";

export async function POST(request: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await request.json();

    const blockId = Number(body.blockId);
    const userId = Number(body.userId);
    const start = dayjs(body.start);

    if (!blockId || !userId || !start.isValid()) {
      return NextResponse.json(
        { success: false, error: "Ungültige Eingabedaten." },
        { status: 400 }
      );
    }

    // 🔥 zentrale Validierung über Scheduling-Core
    const workday = await getEffectiveWorkdayConfig(connection, start);

    if (!workday.isWorkingDay || !workday.workStart || !workday.workEnd) {
      return NextResponse.json(
        { success: false, error: "An diesem Tag kann nicht gearbeitet werden." },
        { status: 400 }
      );
    }

    if (
      start.isBefore(workday.workStart) ||
      !start.isBefore(workday.workEnd)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Startzeit liegt außerhalb der Arbeitszeit.",
        },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    const moved = await moveScheduleBlockWithRules(connection, {
      blockId,
      userId,
      newStart: start.format("YYYY-MM-DD HH:mm:ss"),
    });

    await connection.commit();

    return NextResponse.json({
      success: true,
      block: moved,
    });
  } catch (error) {
    await connection.rollback();

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Fehler",
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}