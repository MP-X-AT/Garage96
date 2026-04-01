import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import { db } from "@/lib/db";
import { findNextAvailableSlot } from "@/lib/scheduling";

export async function POST(req: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = await req.json();

    const userId = Number(body.userId);
    const durationMinutes = Number(body.durationMinutes);
    const date = String(body.date || "");

    if (!userId || Number.isNaN(userId) || !durationMinutes || Number.isNaN(durationMinutes) || !date) {
      return NextResponse.json(
        {
          success: false,
          error: "userId, durationMinutes und date sind erforderlich.",
        },
        { status: 400 }
      );
    }

    if (!dayjs(date, "YYYY-MM-DD", true).isValid()) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Datum." },
        { status: 400 }
      );
    }

    const suggestion = await findNextAvailableSlot({
      connection,
      userId,
      durationMinutes,
      startDate: date,
    });

    return NextResponse.json({
      success: true,
      suggestion,
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