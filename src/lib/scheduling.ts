import dayjs, { Dayjs } from "dayjs";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 17;
export const WORKDAY_MINUTES = (WORK_END_HOUR - WORK_START_HOUR) * 60;

export const WORKDAY_START_HOUR = WORK_START_HOUR;
export const WORKDAY_END_HOUR = WORK_END_HOUR;

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

export type EffectiveWorkdayConfig = {
  date: string;
  isWorkingDay: boolean;
  workStart: Dayjs | null;
  workEnd: Dayjs | null;
  source: "default" | "exception";
  exceptionType?: "holiday" | "closed" | "custom_hours" | "info";
  exceptionName?: string;
};

export function weekdayToDbWeekday(date: Dayjs): number {
  return date.day() === 0 ? 7 : date.day();
}

function setTimeFromString(date: Dayjs, time: string): Dayjs {
  const [hour, minute, second] = time.split(":").map(Number);

  return date
    .hour(hour ?? 0)
    .minute(minute ?? 0)
    .second(second ?? 0)
    .millisecond(0);
}

export async function getWorkingHoursMap(connection: PoolConnection) {
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

export async function getCalendarExceptionForDate(
  connection: PoolConnection,
  date: Dayjs
) {
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
    // INFO-Tage sperren nie die Planung
    if (exception.exception_type === "info" || exception.display_only === 1) {
      const map = await getWorkingHoursMap(connection);
      const weekday = weekdayToDbWeekday(normalizedDate);
      const config = map.get(weekday);

      if (!config || !config.isWorkingDay || !config.startTime || !config.endTime) {
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
        workStart: setTimeFromString(normalizedDate, config.startTime),
        workEnd: setTimeFromString(normalizedDate, config.endTime),
        source: "default",
      };
    }

    const isWorkingDay = !!exception.is_working_day;

    if (!isWorkingDay) {
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
  const config = map.get(weekday);

  if (!config || !config.isWorkingDay || !config.startTime || !config.endTime) {
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
    workStart: setTimeFromString(normalizedDate, config.startTime),
    workEnd: setTimeFromString(normalizedDate, config.endTime),
    source: "default",
  };
}

export async function normalizeToWorkingTime(
  connection: PoolConnection,
  input: Dayjs
): Promise<Dayjs> {
  let current = input.second(0).millisecond(0);

  for (let i = 0; i < 366; i++) {
    const config = await getEffectiveWorkdayConfig(connection, current);

    if (!config.isWorkingDay || !config.workStart || !config.workEnd) {
      current = current.add(1, "day").hour(WORK_START_HOUR).minute(0).second(0).millisecond(0);
      continue;
    }

    if (current.isBefore(config.workStart)) {
      return config.workStart;
    }

    if (!current.isBefore(config.workEnd)) {
      current = current.add(1, "day").hour(WORK_START_HOUR).minute(0).second(0).millisecond(0);
      continue;
    }

    return current;
  }

  throw new Error("Konnte keinen gültigen Arbeitszeitpunkt finden.");
}

export async function nextWorkingDayStart(
  connection: PoolConnection,
  date: Dayjs
): Promise<Dayjs> {
  let current = date.add(1, "day").hour(WORK_START_HOUR).minute(0).second(0).millisecond(0);

  for (let i = 0; i < 366; i++) {
    const config = await getEffectiveWorkdayConfig(connection, current);

    if (config.isWorkingDay && config.workStart) {
      return config.workStart;
    }

    current = current.add(1, "day").hour(WORK_START_HOUR).minute(0).second(0).millisecond(0);
  }

  throw new Error("Konnte keinen nächsten Arbeitstag finden.");
}

export async function splitIntoWorkingBlocks(
  connection: PoolConnection,
  startInput: string | Dayjs,
  durationMinutes: number
): Promise<PlannedBlock[]> {
  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("durationMinutes must be > 0");
  }

  let current =
    typeof startInput === "string"
      ? await normalizeToWorkingTime(connection, dayjs(startInput))
      : await normalizeToWorkingTime(connection, startInput);

  if (!current.isValid()) {
    throw new Error("Ungültiger Startzeitpunkt.");
  }

  let remaining = durationMinutes;
  const blocks: PlannedBlock[] = [];

  for (let i = 0; i < 366 && remaining > 0; i++) {
    const config = await getEffectiveWorkdayConfig(connection, current);

    if (!config.isWorkingDay || !config.workStart || !config.workEnd) {
      current = await nextWorkingDayStart(connection, current);
      continue;
    }

    if (!current.isBefore(config.workEnd)) {
      current = await nextWorkingDayStart(connection, current);
      continue;
    }

    const minutesLeftToday = config.workEnd.diff(current, "minute");

    if (minutesLeftToday <= 0) {
      current = await nextWorkingDayStart(connection, current);
      continue;
    }

    const blockMinutes = Math.min(remaining, minutesLeftToday);
    const blockEnd = current.add(blockMinutes, "minute");

    blocks.push({
      start: current.format("YYYY-MM-DD HH:mm:ss"),
      end: blockEnd.format("YYYY-MM-DD HH:mm:ss"),
      durationMinutes: blockMinutes,
    });

    remaining -= blockMinutes;
    current = blockEnd;

    if (remaining > 0) {
      current = await nextWorkingDayStart(connection, current);
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
) {
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
      WHERE user_id = ?
        AND block_end >= ?
        ${ignoreOrderId ? "AND order_id != ?" : ""}
        ${ignoreBlockId ? "AND id != ?" : ""}
      ORDER BY block_start ASC
    `,
    [
      userId,
      `${fromDate} 00:00:00`,
      ...(ignoreOrderId ? [ignoreOrderId] : []),
      ...(ignoreBlockId ? [ignoreBlockId] : []),
    ]
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

export async function assertNoConflicts(
  connection: PoolConnection,
  userId: number,
  blocks: PlannedBlock[],
  ignoreOrderId?: number,
  ignoreBlockId?: number
) {
  if (!blocks.length) return;

  const existing = await getExistingBlocksForUserFromDate(
    connection,
    userId,
    dayjs(blocks[0].start).format("YYYY-MM-DD"),
    ignoreOrderId,
    ignoreBlockId
  );

  for (const block of blocks) {
    const start = dayjs(block.start);
    const end = dayjs(block.end);

    for (const busy of existing) {
      if (overlaps(start, end, busy.start, busy.end)) {
        throw new Error(
          "Konflikt: Mitarbeiter:in ist in diesem Zeitraum bereits verplant."
        );
      }
    }
  }
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
    [
      row?.planned_start ?? null,
      row?.planned_end ?? null,
      row?.total_minutes ?? 0,
      orderId,
    ]
  );
}

export async function createOrderBlocks(
  connection: PoolConnection,
  params: {
    orderId: number;
    userId: number;
    taskTypeId?: number | null;
    start: string;
    durationMinutes: number;
    source?: "manual" | "auto";
    status?: "geplant" | "in_arbeit" | "pausiert" | "erledigt";
    notes?: string | null;
  }
) {
  const {
    orderId,
    userId,
    taskTypeId,
    start,
    durationMinutes,
    source = "auto",
    status = "geplant",
    notes = null,
  } = params;

  const blocks = await splitIntoWorkingBlocks(connection, start, durationMinutes);

  await assertNoConflicts(connection, userId, blocks);

  for (const block of blocks) {
    await connection.query(
      `
        INSERT INTO schedule_blocks (
          order_id,
          user_id,
          task_type_id,
          block_start,
          block_end,
          status,
          source,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderId,
        userId,
        taskTypeId ?? null,
        block.start,
        block.end,
        status,
        source,
        notes,
      ]
    );
  }

  await syncOrderPlanningFields(connection, orderId);

  return blocks;
}

export async function findNextAvailableSlot(params: {
  connection: PoolConnection;
  userId: number;
  durationMinutes: number;
  startDate: string;
}) {
  const { connection, userId, durationMinutes, startDate } = params;

  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("Ungültige Dauer.");
  }

  const existing = await getExistingBlocksForUserFromDate(
    connection,
    userId,
    startDate
  );

  let cursor = await normalizeToWorkingTime(
    connection,
    dayjs(`${startDate} ${String(WORK_START_HOUR).padStart(2, "0")}:00:00`)
  );

  for (let i = 0; i < 366; i++) {
    const tentativeBlocks = await splitIntoWorkingBlocks(
      connection,
      cursor,
      durationMinutes
    );

    const hasConflict = tentativeBlocks.some((block) => {
      const start = dayjs(block.start);
      const end = dayjs(block.end);

      return existing.some((busy) => overlaps(start, end, busy.start, busy.end));
    });

    if (!hasConflict) {
      return {
        start: tentativeBlocks[0].start,
        end: tentativeBlocks[tentativeBlocks.length - 1].end,
        blocks: tentativeBlocks,
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

    cursor = await normalizeToWorkingTime(connection, conflictingBlock.end);
  }

  throw new Error("Kein freier Slot gefunden.");
}

export async function rescheduleOrder(
  connection: PoolConnection,
  params: {
    orderId: number;
    userId: number;
    start: string;
    durationMinutes: number;
    taskTypeId?: number;
    notes?: string | null;
  }
) {
  const { orderId, userId, start, durationMinutes, taskTypeId, notes = null } = params;

  const blocks = await splitIntoWorkingBlocks(connection, start, durationMinutes);

  await assertNoConflicts(connection, userId, blocks, orderId);

  await connection.query(`DELETE FROM schedule_blocks WHERE order_id = ?`, [orderId]);

  for (const block of blocks) {
    await connection.query(
      `
        INSERT INTO schedule_blocks (
          order_id,
          user_id,
          task_type_id,
          block_start,
          block_end,
          status,
          source,
          notes
        ) VALUES (?, ?, ?, ?, ?, 'geplant', 'auto', ?)
      `,
      [
        orderId,
        userId,
        taskTypeId ?? null,
        block.start,
        block.end,
        notes,
      ]
    );
  }

  await connection.query(
    `
      UPDATE order_assignments
      SET is_primary = CASE WHEN user_id = ? THEN 1 ELSE 0 END
      WHERE order_id = ?
    `,
    [userId, orderId]
  );

  const [assignmentRows] = await connection.query<(RowDataPacket & { cnt: number })[]>(
    `
      SELECT COUNT(*) AS cnt
      FROM order_assignments
      WHERE order_id = ? AND user_id = ?
    `,
    [orderId, userId]
  );

  if (!assignmentRows[0] || assignmentRows[0].cnt === 0) {
    await connection.query(
      `
        INSERT INTO order_assignments (order_id, user_id, role_label, is_primary)
        VALUES (?, ?, 'zuständig', 1)
      `,
      [orderId, userId]
    );
  }

  if (taskTypeId) {
    const [taskTypeRows] = await connection.query<(RowDataPacket & { cnt: number })[]>(
      `
        SELECT COUNT(*) AS cnt
        FROM order_task_types
        WHERE order_id = ? AND task_type_id = ?
      `,
      [orderId, taskTypeId]
    );

    if (!taskTypeRows[0] || taskTypeRows[0].cnt === 0) {
      await connection.query(`DELETE FROM order_task_types WHERE order_id = ?`, [orderId]);

      await connection.query(
        `
          INSERT INTO order_task_types (order_id, task_type_id, estimated_duration_minutes)
          VALUES (?, ?, ?)
        `,
        [orderId, taskTypeId, durationMinutes]
      );
    } else {
      await connection.query(
        `
          UPDATE order_task_types
          SET estimated_duration_minutes = ?
          WHERE order_id = ? AND task_type_id = ?
        `,
        [durationMinutes, orderId, taskTypeId]
      );
    }
  }

  await syncOrderPlanningFields(connection, orderId);

  return blocks;
}

export async function moveScheduleBlockWithRules(
  connection: PoolConnection,
  params: {
    blockId: number;
    userId: number;
    newStart: string;
  }
) {
  const { blockId, userId, newStart } = params;

  const [rows] = await connection.query<
    (RowDataPacket & {
      id: number;
      order_id: number;
      user_id: number;
      task_type_id: number | null;
      block_start: string;
      block_end: string;
      status: "geplant" | "in_arbeit" | "pausiert" | "erledigt";
      source: "manual" | "auto";
      notes: string | null;
    })[]
  >(
    `
      SELECT *
      FROM schedule_blocks
      WHERE id = ?
      LIMIT 1
    `,
    [blockId]
  );

  const block = rows[0];

  if (!block) {
    throw new Error("Block nicht gefunden.");
  }

  const originalStart = dayjs(block.block_start);
  const originalEnd = dayjs(block.block_end);
  const durationMinutes = originalEnd.diff(originalStart, "minute");

  if (durationMinutes <= 0) {
    throw new Error("Ungültige Blockdauer.");
  }

  const normalizedStart = await normalizeToWorkingTime(connection, dayjs(newStart));
  const tentativeBlocks = await splitIntoWorkingBlocks(
    connection,
    normalizedStart,
    durationMinutes
  );

  if (tentativeBlocks.length !== 1) {
    throw new Error(
      "Ein einzelner Block kann nicht über mehrere Arbeitstage verschoben werden."
    );
  }

  await assertNoConflicts(connection, userId, tentativeBlocks, undefined, blockId);

  const movedBlock = tentativeBlocks[0];

  await connection.query(
    `
      UPDATE schedule_blocks
      SET
        user_id = ?,
        block_start = ?,
        block_end = ?,
        source = 'manual'
      WHERE id = ?
    `,
    [userId, movedBlock.start, movedBlock.end, blockId]
  );

  await syncOrderPlanningFields(connection, block.order_id);

  return {
    id: blockId,
    orderId: block.order_id,
    userId,
    start: movedBlock.start,
    end: movedBlock.end,
    durationMinutes,
  };
}