import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";

const allowedStatuses = ["geplant", "in_arbeit", "pausiert", "erledigt"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const scheduleBlockId = Number(body.scheduleBlockId);
    const status = String(body.status ?? "");

    if (!scheduleBlockId || !allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
      return NextResponse.json(
        { success: false, error: "Ungültige Eingabedaten." },
        { status: 400 }
      );
    }

    const [result] = await db.query<ResultSetHeader>(
      `
        UPDATE schedule_blocks
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [status, scheduleBlockId]
    );

    if (result.affectedRows !== 1) {
      return NextResponse.json(
        { success: false, error: "Kalenderblock nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}