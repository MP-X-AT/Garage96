import { NextRequest, NextResponse } from "next/server";
import { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = Number(body.orderId);

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Ungültige Auftrags-ID." },
        { status: 400 }
      );
    }

    const [result] = await db.query<ResultSetHeader>(
      `
        DELETE FROM orders
        WHERE id = ?
      `,
      [orderId]
    );

    if (result.affectedRows !== 1) {
      return NextResponse.json(
        { success: false, error: "Auftrag nicht gefunden." },
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