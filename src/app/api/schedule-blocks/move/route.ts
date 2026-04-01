import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import { db } from "@/lib/db";
import {
  WORKDAY_END_HOUR,
  WORKDAY_START_HOUR,
  moveScheduleBlockWithRules,
} from "@/lib/scheduling";

export async function POST(request: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await request.json();

    const blockId = Number(body.blockId);
    const userId = Number(body.userId);

    const start =
      body.start && dayjs(body.start).isValid()
        ? dayjs(body.start)
        : body.date &&
          body.hour !== undefined &&
          body.hour !== null &&
          !Number.isNaN(Number(body.hour))
        ? dayjs(
            `${body.date} ${String(Number(body.hour)).padStart(2, "0")}:00:00`
          )
        : null;

    if (!blockId || Number.isNaN(blockId)) {
      return NextResponse.json(
        { success: false, error: "blockId ist erforderlich." },
        { status: 400 }
      );
    }

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "userId ist erforderlich." },
        { status: 400 }
      );
    }

    if (!start || !start.isValid()) {
      return NextResponse.json(
        { success: false, error: "Gültige Zielzeit ist erforderlich." },
        { status: 400 }
      );
    }

    const hour = start.hour();

    if (hour < WORKDAY_START_HOUR || hour >= WORKDAY_END_HOUR) {
      return NextResponse.json(
        {
          success: false,
          error: `Verschieben nur innerhalb der Arbeitszeit ${WORKDAY_START_HOUR}:00–${WORKDAY_END_HOUR}:00 möglich.`,
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