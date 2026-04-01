import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const connection = await db.getConnection();

  try {
    const { id } = await context.params;
    const exceptionId = Number(id);

    if (!exceptionId || Number.isNaN(exceptionId)) {
      return NextResponse.json(
        { success: false, error: "Ungültige ID." },
        { status: 400 }
      );
    }

    await connection.query(
      `
        DELETE FROM calendar_exceptions
        WHERE id = ?
      `,
      [exceptionId]
    );

    return NextResponse.json({
      success: true,
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