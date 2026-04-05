import dayjs from "@/lib/dayjs";
import type { Dayjs } from "dayjs";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CalendarBlock } from "@/types/calendar";

export type PlannedBlock = {
  start: string;
  end: string;
  durationMinutes: number;
};

type ExistingBlockRow = RowDataPacket & {
  id: number;
  order_id: number;
  user_id: number;
  task_type_id: number | null;
  block_start: string;
  block_end: string;
  status: "geplant" | "in_arbeit" | "pausiert" | "erledigt";
  source: "manual" | "auto";
  notes: string | null;
};

type WorkingHoursRow = RowDataPacket & {
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: number;
};

type CalendarExceptionRow = RowDataPacket & {
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

export type ExistingBusyBlock = {
  id: number;
  orderId: number;
  userId: number;
  taskTypeId: number | null;
  start: Dayjs;
  end: Dayjs;
  status: "geplant" | "in_arbeit" | "pausiert" | "erledigt";
  source: "manual" | "auto";
  notes: string | null;
};

export type EffectiveWorkdayConfig = {
  date: string;
  isWorkingDay: boolean;
  workStart: Dayjs | null;
  workEnd: Dayjs | null;
  source: "default" | "exception";
  exceptionType?: "holiday" | "closed" | "custom_hours" | "info";
  exceptionName?: string;
};

export type SlotSearchResult = {
  requestedStart: string;
  normalizedRequestedStart: string;
  actualStart: string;
  actualEnd: string;
  blocks: PlannedBlock[];
  adjusted: boolean;
  adjustmentReason:
    | "same_day_shifted"
    | "closed_day"
    | "holiday"
    | "after_hours"
    | "conflict"
    | "grid_aligned"
    | null;
  adjustmentMessage: string | null;
};

const DEFAULT_WORK_START = "08:00:00";
const DEFAULT_GRID_MINUTES = 15;
const MAX_SEARCH_DAYS = 366;

function weekdayToDbWeekday(date: Dayjs): number {
  const weekday = date.day();
  return weekday === 0 ? 7 : weekday;
}

function setTimeFromString(date: Dayjs, time: string): Dayjs {
  const [hour, minute, second] = time.split(":").map(Number);

  return date
    .hour(hour ?? 0)
    .minute(minute ?? 0)
    .second(second ?? 0)
    .millisecond(0);
}

export function snapToTimeGrid(
  value: Dayjs,
  gridMinutes = DEFAULT_GRID_MINUTES,
  mode: "floor" | "ceil" | "nearest" = "nearest"
): Dayjs {
  const normalized = value.second(0).millisecond(0);
  const minutesOfDay = normalized.hour() * 60 + normalized.minute();

  let snappedMinutes: number;

  if (mode === "floor") {
    snappedMinutes = Math.floor(minutesOfDay / gridMinutes) * gridMinutes;
  } else if (mode === "ceil") {
    snappedMinutes = Math.ceil(minutesOfDay / gridMinutes) * gridMinutes;
  } else {
    snappedMinutes = Math.round(minutesOfDay / gridMinutes) * gridMinutes;
  }

  const dayStart = normalized.startOf("day");
  return dayStart.add(snappedMinutes, "minute");
}

async function getWorkingHoursMap(connection: PoolConnection) {
  const [rows] = await connection.query<WorkingHoursRow[]>(
    `
      SELECT weekday, start_time, end_time, is_working_day
      FROM working_hours
      ORDER BY weekday ASC
    `
  );

  const map = new Map<
    number,
    { isWorkingDay: boolean; startTime: string | null; endTime: string | null }
  >();

  for (const row of rows) {
    map.set(row.weekday, {
      isWorkingDay: !!row.is_working_day,
      startTime: row.start_time,
      endTime: row.end_time,
    });
  }

  return map;
}

async function getCalendarExceptionForDate(
  connection: PoolConnection,
  date: Dayjs
): Promise<CalendarExceptionRow | null> {
  const [rows] = await connection.query<CalendarExceptionRow[]>(
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
      WHERE exception_date = ?
      LIMIT 1
    `,
    [date.format("YYYY-MM-DD")]
  );

  return rows[0] ?? null;
}

export async function getEffectiveWorkdayConfig(
  connection: PoolConnection,
  date: Dayjs
): Promise<EffectiveWorkdayConfig> {
  const normalizedDate = date.startOf("day");
  const exception = await getCalendarExceptionForDate(connection, normalizedDate);

  if (exception) {
    if (exception.exception_type === "info" || exception.display_only === 1) {
      const map = await getWorkingHoursMap(connection);
      const weekday = weekdayToDbWeekday(normalizedDate);
      const base = map.get(weekday);

      if (!base || !base.isWorkingDay || !base.startTime || !base.endTime) {
        return {
          date: normalizedDate.format("YYYY-MM-DD"),
          isWorkingDay: false,
          workStart: null,
          workEnd: null,
          source: "default",
        };
      }

      return {
        date: normalizedDate.format("YYYY-MM-DD"),
        isWorkingDay: true,
        workStart: setTimeFromString(normalizedDate, base.startTime),
        workEnd: setTimeFromString(normalizedDate, base.endTime),
        source: "default",
      };
    }

    if (!exception.is_working_day) {
      return {
        date: normalizedDate.format("YYYY-MM-DD"),
        isWorkingDay: false,
        workStart: null,
        workEnd: null,
        source: "exception",
        exceptionType: exception.exception_type,
        exceptionName: exception.name,
      };
    }

    if (!exception.start_time || !exception.end_time) {
      throw new Error(
        `Kalender-Ausnahme für ${normalizedDate.format(
          "YYYY-MM-DD"
        )} ist als Arbeitstag markiert, aber ohne Start-/Endzeit.`
      );
    }

    return {
      date: normalizedDate.format("YYYY-MM-DD"),
      isWorkingDay: true,
      workStart: setTimeFromString(normalizedDate, exception.start_time),
      workEnd: setTimeFromString(normalizedDate, exception.end_time),
      source: "exception",
      exceptionType: exception.exception_type,
      exceptionName: exception.name,
    };
  }

  const map = await getWorkingHoursMap(connection);
  const weekday = weekdayToDbWeekday(normalizedDate);
  const base = map.get(weekday);

  if (!base || !base.isWorkingDay || !base.startTime || !base.endTime) {
    return {
      date: normalizedDate.format("YYYY-MM-DD"),
      isWorkingDay: false,
      workStart: null,
      workEnd: null,
      source: "default",
    };
  }

  return {
    date: normalizedDate.format("YYYY-MM-DD"),
    isWorkingDay: true,
    workStart: setTimeFromString(normalizedDate, base.startTime),
    workEnd: setTimeFromString(normalizedDate, base.endTime),
    source: "default",
  };
}

export async function normalizeToWorkingTime(
  connection: PoolConnection,
  input: Dayjs,
  gridMinutes = DEFAULT_GRID_MINUTES
): Promise<Dayjs> {
  let cursor = snapToTimeGrid(input, gridMinutes, "ceil");

  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    const config = await getEffectiveWorkdayConfig(connection, cursor);

    if (!config.isWorkingDay || !config.workStart || !config.workEnd) {
      cursor = cursor.add(1, "day").hour(8).minute(0).second(0).millisecond(0);
      cursor = snapToTimeGrid(cursor, gridMinutes, "ceil");
      continue;
    }

    if (cursor.isBefore(config.workStart)) {
      return snapToTimeGrid(config.workStart, gridMinutes, "ceil");
    }

    if (!cursor.isBefore(config.workEnd)) {
      cursor = cursor.add(1, "day").hour(8).minute(0).second(0).millisecond(0);
      cursor = snapToTimeGrid(cursor, gridMinutes, "ceil");
      continue;
    }

    return snapToTimeGrid(cursor, gridMinutes, "ceil");
  }

  throw new Error("Konnte keinen gültigen Arbeitszeitpunkt finden.");
}

async function nextWorkingDayStart(
  connection: PoolConnection,
  input: Dayjs,
  gridMinutes = DEFAULT_GRID_MINUTES
): Promise<Dayjs> {
  let cursor = input.add(1, "day").hour(8).minute(0).second(0).millisecond(0);

  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    const config = await getEffectiveWorkdayConfig(connection, cursor);

    if (config.isWorkingDay && config.workStart) {
      return snapToTimeGrid(config.workStart, gridMinutes, "ceil");
    }

    cursor = cursor.add(1, "day").hour(8).minute(0).second(0).millisecond(0);
  }

  throw new Error("Konnte keinen nächsten Arbeitstag finden.");
}

export async function splitIntoWorkingBlocks(
  connection: PoolConnection,
  startInput: string | Dayjs,
  durationMinutes: number,
  gridMinutes = DEFAULT_GRID_MINUTES
): Promise<PlannedBlock[]> {
  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("Gültige Dauer ist erforderlich.");
  }

  let cursor = typeof startInput === "string" ? dayjs(startInput) : startInput;

  if (!cursor.isValid()) {
    throw new Error("Ungültiger Startzeitpunkt.");
  }

  cursor = await normalizeToWorkingTime(connection, cursor, gridMinutes);

  const blocks: PlannedBlock[] = [];
  let remaining = durationMinutes;

  for (let i = 0; i < MAX_SEARCH_DAYS && remaining > 0; i++) {
    const config = await getEffectiveWorkdayConfig(connection, cursor);

    if (!config.isWorkingDay || !config.workStart || !config.workEnd) {
      cursor = await nextWorkingDayStart(connection, cursor, gridMinutes);
      continue;
    }

    if (!cursor.isBefore(config.workEnd)) {
      cursor = await nextWorkingDayStart(connection, cursor, gridMinutes);
      continue;
    }

    const usableMinutes = config.workEnd.diff(cursor, "minute");

    if (usableMinutes <= 0) {
      cursor = await nextWorkingDayStart(connection, cursor, gridMinutes);
      continue;
    }

    const blockMinutes = Math.min(remaining, usableMinutes);
    const blockEnd = cursor.add(blockMinutes, "minute");

    blocks.push({
      start: cursor.format("YYYY-MM-DD HH:mm:ss"),
      end: blockEnd.format("YYYY-MM-DD HH:mm:ss"),
      durationMinutes: blockMinutes,
    });

    remaining -= blockMinutes;

    if (remaining > 0) {
      cursor = await nextWorkingDayStart(connection, cursor, gridMinutes);
    }
  }

  if (remaining > 0) {
    throw new Error("Planung konnte nicht vollständig erstellt werden.");
  }

  return blocks;
}

export function overlaps(
  aStart: Dayjs,
  aEnd: Dayjs,
  bStart: Dayjs,
  bEnd: Dayjs
): boolean {
  return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
}

export async function getExistingBlocksForUserFromDate(
  connection: PoolConnection,
  userId: number,
  fromDate: string,
  ignoreOrderId?: number,
  ignoreBlockId?: number
): Promise<ExistingBusyBlock[]> {
  const conditions = ["user_id = ?", "block_end >= ?"];
  const params: Array<number | string> = [userId, `${fromDate} 00:00:00`];

  if (ignoreOrderId) {
    conditions.push("order_id != ?");
    params.push(ignoreOrderId);
  }

  if (ignoreBlockId) {
    conditions.push("id != ?");
    params.push(ignoreBlockId);
  }

  const [rows] = await connection.query<ExistingBlockRow[]>(
    `
      SELECT
        id,
        order_id,
        user_id,
        task_type_id,
        block_start,
        block_end,
        status,
        source,
        notes
      FROM schedule_blocks
      WHERE ${conditions.join(" AND ")}
      ORDER BY block_start ASC
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    taskTypeId: row.task_type_id,
    start: dayjs(row.block_start),
    end: dayjs(row.block_end),
    status: row.status,
    source: row.source,
    notes: row.notes,
  }));
}

export async function syncOrderPlanningFields(
  connection: PoolConnection,
  orderId: number
) {
  const [rows] = await connection.query<
    (RowDataPacket & {
      planned_start: string | null;
      planned_end: string | null;
      total_minutes: number | null;
    })[]
  >(
    `
      SELECT
        MIN(block_start) AS planned_start,
        MAX(block_end) AS planned_end,
        COALESCE(SUM(TIMESTAMPDIFF(MINUTE, block_start, block_end)), 0) AS total_minutes
      FROM schedule_blocks
      WHERE order_id = ?
    `,
    [orderId]
  );

  const row = rows[0];

  await connection.query(
    `
      UPDATE orders
      SET
        planned_start = ?,
        planned_end = ?,
        estimated_duration_minutes = ?
      WHERE id = ?
    `,
    [row?.planned_start ?? null, row?.planned_end ?? null, row?.total_minutes ?? 0, orderId]
  );
}

function buildAdjustmentMessage(args: {
  reason: SlotSearchResult["adjustmentReason"];
  actualStart: Dayjs;
  exceptionName?: string;
}) {
  const { reason, actualStart, exceptionName } = args;

  if (reason === "holiday" && exceptionName) {
    return `Der gewünschte Tag ist wegen „${exceptionName}“ nicht verfügbar. Geplant wurde stattdessen ab ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  if (reason === "closed_day") {
    return `Der gewünschte Tag ist kein Arbeitstag. Geplant wurde stattdessen ab ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  if (reason === "after_hours") {
    return `Der gewünschte Zeitpunkt liegt außerhalb der Öffnungszeiten. Geplant wurde stattdessen ab ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  if (reason === "conflict") {
    return `Der gewünschte Slot war bereits belegt. Geplant wurde der nächste freie Zeitpunkt ab ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  if (reason === "same_day_shifted") {
    return `Der gewünschte Start wurde an die Arbeitszeiten angepasst: ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  if (reason === "grid_aligned") {
    return `Der gewünschte Start wurde auf das 15-Minuten-Raster angepasst: ${actualStart.format(
      "DD.MM.YYYY HH:mm"
    )}.`;
  }

  return null;
}

export async function findNextAvailableSlot(params: {
  connection: PoolConnection;
  userId: number;
  durationMinutes: number;
  startDate: string;
  requestedStart?: string;
  gridMinutes?: number;
}): Promise<SlotSearchResult> {
  const {
    connection,
    userId,
    durationMinutes,
    startDate,
    requestedStart,
    gridMinutes = DEFAULT_GRID_MINUTES,
  } = params;

  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("Ungültige Dauer.");
  }

  const requested = requestedStart
    ? dayjs(requestedStart)
    : dayjs(`${startDate} ${DEFAULT_WORK_START}`);

  if (!requested.isValid()) {
    throw new Error("Ungültiger gewünschter Start.");
  }

  const gridAlignedRequested = snapToTimeGrid(requested, gridMinutes, "ceil");
  const originalConfig = await getEffectiveWorkdayConfig(connection, requested);
  const normalizedRequestedStart = await normalizeToWorkingTime(
    connection,
    gridAlignedRequested,
    gridMinutes
  );
  const existing = await getExistingBlocksForUserFromDate(connection, userId, startDate);

  let cursor = normalizedRequestedStart;
  let adjustmentReason: SlotSearchResult["adjustmentReason"] = null;

  if (!requested.isSame(gridAlignedRequested)) {
    adjustmentReason = "grid_aligned";
  }

  if (!originalConfig.isWorkingDay) {
    adjustmentReason =
      originalConfig.source === "exception" && originalConfig.exceptionType === "holiday"
        ? "holiday"
        : "closed_day";
  } else if (originalConfig.workStart && requested.isBefore(originalConfig.workStart)) {
    adjustmentReason = "same_day_shifted";
  } else if (originalConfig.workEnd && !requested.isBefore(originalConfig.workEnd)) {
    adjustmentReason = "after_hours";
  } else if (!requested.isSame(normalizedRequestedStart)) {
    adjustmentReason = adjustmentReason ?? "same_day_shifted";
  }

  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    const tentativeBlocks = await splitIntoWorkingBlocks(
      connection,
      cursor,
      durationMinutes,
      gridMinutes
    );

    const hasConflict = tentativeBlocks.some((block) => {
      const start = dayjs(block.start);
      const end = dayjs(block.end);

      return existing.some((busy) => overlaps(start, end, busy.start, busy.end));
    });

    if (!hasConflict) {
      const actualStart = dayjs(tentativeBlocks[0].start);
      const actualEnd = dayjs(tentativeBlocks[tentativeBlocks.length - 1].end);

      return {
        requestedStart: requested.format("YYYY-MM-DD HH:mm:ss"),
        normalizedRequestedStart: normalizedRequestedStart.format("YYYY-MM-DD HH:mm:ss"),
        actualStart: actualStart.format("YYYY-MM-DD HH:mm:ss"),
        actualEnd: actualEnd.format("YYYY-MM-DD HH:mm:ss"),
        blocks: tentativeBlocks,
        adjusted:
          !actualStart.isSame(requested) || !normalizedRequestedStart.isSame(requested),
        adjustmentReason,
        adjustmentMessage: buildAdjustmentMessage({
          reason: adjustmentReason,
          actualStart,
          exceptionName: originalConfig.exceptionName,
        }),
      };
    }

    const conflictingBlock = existing.find((busy) =>
      tentativeBlocks.some((block) =>
        overlaps(dayjs(block.start), dayjs(block.end), busy.start, busy.end)
      )
    );

    if (!conflictingBlock) {
      break;
    }

    adjustmentReason = "conflict";
    cursor = await normalizeToWorkingTime(connection, conflictingBlock.end, gridMinutes);
  }

  throw new Error("Kein freier Slot gefunden.");
}

export async function moveScheduleBlockWithRules(
  connection: PoolConnection,
  params: {
    blockId: number;
    userId: number;
    newStart: string;
    gridMinutes?: number;
  }
): Promise<CalendarBlock> {
  const gridMinutes = params.gridMinutes ?? DEFAULT_GRID_MINUTES;

  const [rows] = await connection.query<
    (RowDataPacket & {
      id: number;
      block_start: string | Date;
      block_end: string | Date;
    })[]
  >(
    `
      SELECT id, block_start, block_end
      FROM schedule_blocks
      WHERE id = ?
      LIMIT 1
    `,
    [params.blockId]
  );

  if (rows.length === 0) {
    throw new Error("Kalenderblock nicht gefunden.");
  }

  const currentBlock = rows[0];
  const oldStart = dayjs(currentBlock.block_start);
  const oldEnd = dayjs(currentBlock.block_end);
  const durationMinutes = oldEnd.diff(oldStart, "minute");

  if (durationMinutes <= 0) {
    throw new Error("Ungültige Blockdauer.");
  }

  let newStart = dayjs(params.newStart);

  if (!newStart.isValid()) {
    throw new Error("Ungültiger neuer Startzeitpunkt.");
  }

  newStart = snapToTimeGrid(newStart, gridMinutes, "floor")
    .second(0)
    .millisecond(0);

  const newEnd = newStart.add(durationMinutes, "minute");
  const workday = await getEffectiveWorkdayConfig(connection, newStart);

  if (!workday.isWorkingDay || !workday.workStart || !workday.workEnd) {
    throw new Error("An diesem Tag kann nicht eingeplant werden.");
  }

  if (
    !newStart.isSame(workday.workStart, "day") ||
    !newEnd.isSame(workday.workStart, "day")
  ) {
    throw new Error("Ein Block darf beim Verschieben nicht auf den nächsten Tag ragen.");
  }

  if (newStart.isBefore(workday.workStart) || newEnd.isAfter(workday.workEnd)) {
    throw new Error("Der Block liegt außerhalb der gültigen Arbeitszeit.");
  }

  const [conflicts] = await connection.query<RowDataPacket[]>(
    `
      SELECT id
      FROM schedule_blocks
      WHERE user_id = ?
        AND id <> ?
        AND block_start < ?
        AND block_end > ?
      LIMIT 1
    `,
    [
      params.userId,
      params.blockId,
      newEnd.format("YYYY-MM-DD HH:mm:ss"),
      newStart.format("YYYY-MM-DD HH:mm:ss"),
    ]
  );

  if (conflicts.length > 0) {
    throw new Error("Konflikt: Diese Person ist in diesem Zeitraum bereits eingeplant.");
  }

  const [result] = await connection.query<ResultSetHeader>(
    `
      UPDATE schedule_blocks
      SET user_id = ?,
          block_start = ?,
          block_end = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      params.userId,
      newStart.format("YYYY-MM-DD HH:mm:ss"),
      newEnd.format("YYYY-MM-DD HH:mm:ss"),
      params.blockId,
    ]
  );

  if (result.affectedRows !== 1) {
    throw new Error("Kalenderblock konnte nicht aktualisiert werden.");
  }

  const [movedRows] = await connection.query<RowDataPacket[]>(
    `
      SELECT *
      FROM v_calendar_blocks
      WHERE schedule_block_id = ?
      LIMIT 1
    `,
    [params.blockId]
  );

  if (movedRows.length === 0) {
    throw new Error("Aktualisierter Kalenderblock konnte nicht geladen werden.");
  }

  return movedRows[0] as CalendarBlock;
}
