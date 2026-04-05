import dayjs from "@/lib/dayjs";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type { CalendarBlock } from "@/types/calendar";
import { moveScheduleBlockWithRules } from "@/lib/scheduling";

export type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

export type UserOption = {
  id: number;
  name: string;
};

export type CalendarException = {
  id: number;
  exception_date: string;
  exception_type: "holiday" | "closed" | "custom_hours" | "info";
  name: string;
  is_working_day: number;
  display_only: number;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};

type CalendarExceptionRow = RowDataPacket & {
  id: number;
  exception_date: string | Date;
  exception_type: "holiday" | "closed" | "custom_hours" | "info";
  name: string;
  is_working_day: number;
  display_only: number;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};


const DEFAULT_USERS: UserOption[] = [
  { id: 1, name: "Michi" },
  { id: 2, name: "Sandra" },
  { id: 3, name: "Erwin" },
];


function normalizeDate(date: string) {
  const parsed = dayjs(date);

  if (!parsed.isValid()) {
    throw new Error(`Ungültiges Datum: ${date}`);
  }

  return parsed;
}

function mapCalendarException(row: CalendarExceptionRow): CalendarException {
  return {
    id: Number(row.id),
    exception_date: dayjs(row.exception_date).format("YYYY-MM-DD"),
    exception_type: row.exception_type,
    name: String(row.name),
    is_working_day: Number(row.is_working_day ?? 0),
    display_only: Number(row.display_only ?? 0),
    start_time: row.start_time ? String(row.start_time) : null,
    end_time: row.end_time ? String(row.end_time) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

async function getCalendarBlocksForRange(
  rangeStart: string,
  rangeEndExclusive: string
): Promise<CalendarBlock[]> {
  const [rows] = await db.query(
    `
      SELECT *
      FROM v_calendar_blocks
      WHERE block_start < ?
        AND block_end > ?
      ORDER BY block_start ASC, user_name ASC
    `,
    [rangeEndExclusive, rangeStart]
  );

  return rows as CalendarBlock[];
}

export async function getDayCalendarBlocks(date: string): Promise<CalendarBlock[]> {
  const day = normalizeDate(date).startOf("day");
  const start = day.format("YYYY-MM-DD HH:mm:ss");
  const end = day.add(1, "day").format("YYYY-MM-DD HH:mm:ss");

  return getCalendarBlocksForRange(start, end);
}

export async function getWeekCalendarBlocks(weekStart: string): Promise<CalendarBlock[]> {
  const startDate = normalizeDate(weekStart).startOf("day");
  const endDateExclusive = startDate.add(7, "day").startOf("day");

  return getCalendarBlocksForRange(
    startDate.format("YYYY-MM-DD HH:mm:ss"),
    endDateExclusive.format("YYYY-MM-DD HH:mm:ss")
  );
}

export async function getUsersForDay(date: string): Promise<UserOption[]> {
  const blocks = await getDayCalendarBlocks(date);

  const usersMap = new Map<number, string>();

  for (const block of blocks) {
    if (!usersMap.has(block.user_id)) {
      usersMap.set(block.user_id, block.user_name);
    }
  }

  const users = Array.from(usersMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return users.length > 0 ? users : DEFAULT_USERS;
}

export async function getTaskTypes(): Promise<TaskTypeOption[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT id, name, color
      FROM task_types
      WHERE is_active = 1
      ORDER BY sort_order, name
    `
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    color: row.color ? String(row.color) : null,
  }));
}

export async function getAllActiveUsers(): Promise<UserOption[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT id, name
      FROM users
      WHERE is_active = 1
      ORDER BY sort_order, name
    `
  );

  const users = rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
  }));

  return users.length > 0 ? users : DEFAULT_USERS;
}

export async function moveScheduleBlock(params: {
  scheduleBlockId: number;
  userId: number;
  newStart: string;
}) {
  const connection = await db.getConnection();

  try {
    return await moveScheduleBlockWithRules(connection, {
      blockId: params.scheduleBlockId,
      userId: params.userId,
      newStart: params.newStart,
    });
  } finally {
    connection.release();
  }
}

export async function getCalendarExceptions(
  from: string,
  to: string
): Promise<CalendarException[]> {
  const fromDate = normalizeDate(from).format("YYYY-MM-DD");
  const toDate = normalizeDate(to).format("YYYY-MM-DD");

  const [rows] = await db.query<CalendarExceptionRow[]>(
    `
      SELECT
        id,
        exception_date,
        exception_type,
        name,
        is_working_day,
        display_only,
        start_time,
        end_time,
        notes
      FROM calendar_exceptions
      WHERE exception_date BETWEEN ? AND ?
      ORDER BY exception_date ASC
    `,
    [fromDate, toDate]
  );

  return rows.map(mapCalendarException);
}

export async function getCalendarExceptionsForDay(
  date: string
): Promise<CalendarException[]> {
  const day = normalizeDate(date).format("YYYY-MM-DD");
  return getCalendarExceptions(day, day);
}

export async function getCalendarExceptionsForWeek(
  weekStart: string
): Promise<CalendarException[]> {
  const start = normalizeDate(weekStart).startOf("day");
  const end = start.add(6, "day").endOf("day");

  return getCalendarExceptions(
    start.format("YYYY-MM-DD"),
    end.format("YYYY-MM-DD")
  );
}

export async function getCalendarExceptionsForMonth(
  month: string
): Promise<CalendarException[]> {
  const start = normalizeDate(month).startOf("month").startOf("week").add(1, "day");
  const end = normalizeDate(month).endOf("month").endOf("week").subtract(1, "day");

  return getCalendarExceptions(
    start.format("YYYY-MM-DD"),
    end.format("YYYY-MM-DD")
  );
}

export async function getCalendarExceptionsForYear(
  year: number
): Promise<CalendarException[]> {
  if (!year || Number.isNaN(year)) {
    throw new Error("Ungültiges Jahr.");
  }

  return getCalendarExceptions(`${year}-01-01`, `${year}-12-31`);
}

export async function getMonthCalendarBlocks(month: string): Promise<CalendarBlock[]> {
  const start = normalizeDate(month).startOf("month").startOf("week").add(1, "day");
  const endExclusive = normalizeDate(month)
    .endOf("month")
    .endOf("week")
    .subtract(1, "day")
    .add(1, "day")
    .startOf("day");

  return getCalendarBlocksForRange(
    start.startOf("day").format("YYYY-MM-DD HH:mm:ss"),
    endExclusive.format("YYYY-MM-DD HH:mm:ss")
  );
}

export async function getYearCalendarBlocks(year: number): Promise<CalendarBlock[]> {
  if (!year || Number.isNaN(year)) {
    throw new Error("Ungültiges Jahr.");
  }

  const start = dayjs(`${year}-01-01`).startOf("day");
  const endExclusive = dayjs(`${year + 1}-01-01`).startOf("day");

  return getCalendarBlocksForRange(
    start.format("YYYY-MM-DD HH:mm:ss"),
    endExclusive.format("YYYY-MM-DD HH:mm:ss")
  );
}