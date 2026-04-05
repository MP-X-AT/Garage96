import { NextRequest, NextResponse } from "next/server";
import dayjs from "@/lib/dayjs";
import { db } from "@/lib/db";
import { moveScheduleBlockWithRules } from "@/lib/scheduling";

type BlockRow = {
  id: number;
  user_id: number;
  block_start: string | Date;
  block_end: string | Date;
};

function buildTargetStartForMonth(blockStart: string | Date, targetMonth: string) {
  const originalStart = dayjs(blockStart);
  const monthStart = dayjs(targetMonth).startOf("month");

  if (!monthStart.isValid()) {
    throw new Error("Ungültiger Zielmonat.");
  }

  const targetDay = Math.min(originalStart.date(), monthStart.daysInMonth());

  return monthStart
    .date(targetDay)
    .hour(originalStart.hour())
    .minute(originalStart.minute())
    .second(0)
    .millisecond(0);
}

export async function POST(request: NextRequest) {
  const connection = await db.getConnection();

  try {
    const body = (await request.json()) as Record<string, unknown>;

    const blockId = Number(body.blockId);
    const userId = Number(body.userId);
    const targetMonth = String(body.targetMonth ?? "");

    if (!blockId || Number.isNaN(blockId) || !userId || Number.isNaN(userId) || !targetMonth) {
      return NextResponse.json(
        { success: false, error: "Ungültige Anfrage." },
        { status: 400 }
      );
    }

    const [rows] = await connection.query(
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
    const newStart = buildTargetStartForMonth(block.block_start, targetMonth);

    await connection.beginTransaction();

    const moved = await moveScheduleBlockWithRules(connection, {
      blockId,
      userId,
      newStart: newStart.format("YYYY-MM-DD HH:mm:ss"),
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
        error:
          error instanceof Error ? error.message : "Verschieben fehlgeschlagen.",
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}