"use client";

import Link from "next/link";
import dayjs from "@/lib/dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import type { CalendarBlock } from "@/types/calendar";
import type { CalendarException } from "@/lib/calendar";
import {
  formatHours,
  getEmployeeTheme,
  getTaskTheme,
  getStatusLabel,
  getStatusTheme,
} from "@/lib/ui-theme";

dayjs.extend(isoWeek);

type UserColumn = {
  id: number;
  name: string;
};

type MonthViewClientProps = {
  month: string;
  users: UserColumn[];
  blocks: CalendarBlock[];
  exceptions: CalendarException[];
};

type DayCell = {
  date: dayjs.Dayjs;
  key: string;
  blocks: CalendarBlock[];
  exception: CalendarException | null;
  inMonth: boolean;
};

type MonthWeek = {
  key: string;
  days: DayCell[];
};

type MonthSegment = {
  block: CalendarBlock;
  weekKey: string;
  startDayIndex: number;
  endDayIndex: number;
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  lane: number;
  laneCount: number;
};

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DAYS_PER_WEEK = 6;
const MAX_MOBILE_PREVIEW = 3;
const DESKTOP_WEEK_MIN_HEIGHT = 230;

function getExceptionStyle(exception: CalendarException | null) {
  if (!exception) {
    return {
      chipClass: "bg-slate-50 text-slate-500 border-slate-200",
      dayClass: "",
    };
  }

  if (exception.display_only === 1 || exception.exception_type === "info") {
    return {
      chipClass: "bg-sky-50 text-sky-700 border-sky-200",
      dayClass: "ring-1 ring-sky-100",
    };
  }

  return {
    chipClass: "bg-red-50 text-red-700 border-red-200",
    dayClass: "ring-1 ring-red-100 bg-red-50/20",
  };
}

function ExceptionBadge({ exception }: { exception: CalendarException | null }) {
  if (!exception) return null;

  const styles = getExceptionStyle(exception);

  return (
    <div
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles.chipClass}`}
      title={exception.notes ?? exception.name}
    >
      <span className="truncate">{exception.name}</span>
    </div>
  );
}

function getLoadColor(totalMinutes: number) {
  if (totalMinutes >= 8 * 60) return "bg-slate-900";
  if (totalMinutes >= 5 * 60) return "bg-slate-600";
  if (totalMinutes >= 2 * 60) return "bg-slate-400";
  return "bg-slate-200";
}

function overlapsDay(block: CalendarBlock, day: dayjs.Dayjs) {
  const dayStart = day.startOf("day");
  const dayEnd = day.add(1, "day").startOf("day");
  const blockStart = dayjs(block.block_start);
  const blockEnd = dayjs(block.block_end);
  return blockStart.isBefore(dayEnd) && blockEnd.isAfter(dayStart);
}

function buildMonthWeeks(
  month: string,
  blocks: CalendarBlock[],
  exceptions: CalendarException[]
): MonthWeek[] {
  const monthStart = dayjs(month).startOf("month");
  const monthEnd = dayjs(month).endOf("month");

  const gridStart = monthStart.isoWeekday(1);
  const monthEndWeekSaturday = monthEnd.isoWeekday() === 7
    ? monthEnd.subtract(1, "day")
    : monthEnd.isoWeekday() > 6
      ? monthEnd.isoWeekday(6)
      : monthEnd.isoWeekday(6);

  const gridEnd = monthEndWeekSaturday.endOf("day");

  const exceptionMap = new Map(
    exceptions.map((item) => [item.exception_date, item])
  );

  const days: DayCell[] = [];

  for (
    let cursor = gridStart.startOf("day");
    cursor.isBefore(gridEnd) || cursor.isSame(gridEnd, "day");
    cursor = cursor.add(1, "day")
  ) {
    if (cursor.isoWeekday() === 7) continue;

    const key = cursor.format("YYYY-MM-DD");
    const dayBlocks = blocks
      .filter((block) => overlapsDay(block, cursor))
      .sort((a, b) => {
        const aStart = dayjs(a.block_start);
        const bStart = dayjs(b.block_start);

        if (aStart.isSame(bStart)) {
          return a.schedule_block_id - b.schedule_block_id;
        }

        return aStart.valueOf() - bStart.valueOf();
      });

    days.push({
      date: cursor,
      key,
      blocks: dayBlocks,
      exception: exceptionMap.get(key) ?? null,
      inMonth: cursor.format("YYYY-MM") === monthStart.format("YYYY-MM"),
    });
  }

  const weeks: MonthWeek[] = [];

  for (let i = 0; i < days.length; i += DAYS_PER_WEEK) {
    const weekDays = days.slice(i, i + DAYS_PER_WEEK);
    if (weekDays.length === DAYS_PER_WEEK) {
      weeks.push({
        key: weekDays[0].key,
        days: weekDays,
      });
    }
  }

  return weeks;
}

function getDayStats(blocks: CalendarBlock[]) {
  const totalMinutes = blocks.reduce(
    (sum, block) => sum + block.block_duration_minutes,
    0
  );
  const urgentCount = blocks.filter(
    (block) => block.priority === "hoch" || block.priority === "dringend"
  ).length;
  const activeUsers = new Set(blocks.map((block) => block.user_id)).size;

  return {
    totalMinutes,
    urgentCount,
    activeUsers,
    count: blocks.length,
  };
}

function buildWeekSegments(week: MonthWeek): MonthSegment[] {
  const weekStart = week.days[0].date.startOf("day");
  const weekEnd = week.days[week.days.length - 1].date.add(1, "day").startOf("day");

  const seen = new Set<number>();

  const uniqueBlocks = week.days
    .flatMap((day) => day.blocks)
    .filter((block) => {
      if (seen.has(block.schedule_block_id)) return false;
      seen.add(block.schedule_block_id);
      return true;
    });

  const rawSegments = uniqueBlocks
    .map((block) => {
      const blockStart = dayjs(block.block_start);
      const blockEnd = dayjs(block.block_end);

      if (!(blockStart.isBefore(weekEnd) && blockEnd.isAfter(weekStart))) {
        return null;
      }

      const effectiveStart = blockStart.isAfter(weekStart) ? blockStart : weekStart;
      const effectiveEnd = blockEnd.isBefore(weekEnd) ? blockEnd : weekEnd;

      if (!effectiveEnd.isAfter(effectiveStart)) return null;

      const startDayIndex = Math.max(
        0,
        Math.min(
          DAYS_PER_WEEK - 1,
          effectiveStart.startOf("day").diff(weekStart, "day")
        )
      );

      const endDayIndex = Math.max(
        0,
        Math.min(
          DAYS_PER_WEEK - 1,
          effectiveEnd.subtract(1, "minute").startOf("day").diff(weekStart, "day")
        )
      );

      return {
        block,
        weekKey: week.key,
        startDayIndex,
        endDayIndex,
        startsBeforeWeek: blockStart.isBefore(weekStart),
        endsAfterWeek: blockEnd.isAfter(weekEnd),
      };
    })
    .filter(
      (
        item
      ): item is Omit<MonthSegment, "lane" | "laneCount"> => item !== null
    )
    .sort((a, b) => {
      if (a.startDayIndex !== b.startDayIndex) {
        return a.startDayIndex - b.startDayIndex;
      }

      const aStart = dayjs(a.block.block_start).valueOf();
      const bStart = dayjs(b.block.block_start).valueOf();

      if (aStart !== bStart) return aStart - bStart;

      return a.block.schedule_block_id - b.block.schedule_block_id;
    });

  const laneEndByIndex: number[] = [];
  const withLanes: MonthSegment[] = rawSegments.map((segment) => {
    let lane = laneEndByIndex.findIndex(
      (currentEnd) => currentEnd < segment.startDayIndex
    );

    if (lane === -1) {
      lane = laneEndByIndex.length;
      laneEndByIndex.push(segment.endDayIndex);
    } else {
      laneEndByIndex[lane] = segment.endDayIndex;
    }

    return {
      ...segment,
      lane,
      laneCount: 1,
    };
  });

  const laneCount = withLanes.length > 0
    ? Math.max(...withLanes.map((item) => item.lane)) + 1
    : 1;

  return withLanes.map((item) => ({
    ...item,
    laneCount,
  }));
}

function formatSegmentTimeLabel(block: CalendarBlock, startsBeforeWeek: boolean, endsAfterWeek: boolean) {
  const startLabel = startsBeforeWeek ? "…" : dayjs(block.block_start).format("HH:mm");
  const endLabel = endsAfterWeek ? "…" : dayjs(block.block_end).format("HH:mm");
  return `${startLabel}–${endLabel}`;
}

function MonthBarCard({
  segment,
  onOpen,
}: {
  segment: MonthSegment;
  onOpen: (block: CalendarBlock) => void;
}) {
  const block = segment.block;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `month-block-${block.schedule_block_id}`,
    data: { block },
  });

  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });
  const taskTheme = getTaskTheme({
    taskName: block.task_type_name,
    taskColor: block.task_type_color,
  });
  const statusTheme = getStatusTheme(block.block_status);

  const dragStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...dragStyle,
        borderColor: employeeTheme.border,
      }}
      className={`relative h-full overflow-hidden rounded-2xl border bg-white px-3 py-2 shadow-sm ${
        isDragging ? "opacity-50" : "cursor-grab active:cursor-grabbing"
      }`}
      aria-label={`${block.title} verschieben`}
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5"
        style={{ backgroundColor: employeeTheme.solid }}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(block);
        }}
        className="absolute inset-0"
        aria-label={`Details zu ${block.title} öffnen`}
      />

      <div className="relative z-10 flex h-full min-w-0 items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-900">
            {block.title}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {block.customer_name}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[10px]">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
              style={{
                backgroundColor: `${statusTheme.solid}18`,
                color: statusTheme.text,
              }}
            >
              {getStatusLabel(block.block_status)}
            </span>
            <span
              className="truncate"
              style={{ color: taskTheme.text }}
            >
              {block.task_type_name || "Ohne Arbeitsart"}
            </span>
            <span className="truncate text-slate-400">{block.user_name}</span>
          </div>
        </div>

        <div className="shrink-0 text-[11px] font-medium text-slate-500">
          {formatSegmentTimeLabel(
            block,
            segment.startsBeforeWeek,
            segment.endsAfterWeek
          )}
        </div>
      </div>
    </div>
  );
}

function DragOverlayCard({ block }: { block: CalendarBlock }) {
  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  return (
    <div
      className="w-[320px] rounded-[22px] border bg-white p-3 shadow-xl"
      style={{ borderColor: employeeTheme.border }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {block.title}
          </div>
          <div className="truncate text-xs text-slate-500">
            {block.customer_name}
          </div>
        </div>
        <div className="shrink-0 text-[11px] font-medium text-slate-500">
          {dayjs(block.block_start).format("DD.MM. HH:mm")}
        </div>
      </div>
      <div className="text-[11px] text-slate-400">
        {block.user_name} · {formatHours(block.block_duration_minutes)}
      </div>
    </div>
  );
}

function MonthDropZone({
  day,
  children,
}: {
  day: DayCell;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `month-day-${day.key}`,
    data: { day },
  });

  const styles = getExceptionStyle(day.exception);

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[116px] border-r border-b bg-white p-3 transition ${styles.dayClass} ${
        isOver ? "bg-sky-50/70" : ""
      } ${!day.inMonth ? "opacity-55" : ""}`}
    >
      {children}
    </div>
  );
}

function DayPreviewList({
  blocks,
  onOpen,
}: {
  blocks: CalendarBlock[];
  onOpen: (block: CalendarBlock) => void;
}) {
  const preview = blocks.slice(0, MAX_MOBILE_PREVIEW);

  if (preview.length === 0) {
    return <div className="text-xs text-slate-400">Frei</div>;
  }

  return (
    <div className="space-y-2">
      {preview.map((block) => {
        const employeeTheme = getEmployeeTheme({
          userId: block.user_id,
          userName: block.user_name,
        });

        return (
          <button
            key={block.schedule_block_id}
            type="button"
            onClick={() => onOpen(block)}
            className="w-full rounded-2xl border bg-white px-3 py-2 text-left"
            style={{ borderColor: employeeTheme.border }}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-slate-900">
                  {block.title}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {block.customer_name}
                </div>
              </div>
              <div className="shrink-0 text-[11px] font-medium text-slate-400">
                {dayjs(block.block_start).format("HH:mm")}
              </div>
            </div>
            <div className="text-[11px] text-slate-400">{block.user_name}</div>
          </button>
        );
      })}

      {blocks.length > MAX_MOBILE_PREVIEW ? (
        <div className="text-[11px] font-medium text-slate-400">
          +{blocks.length - MAX_MOBILE_PREVIEW} weitere
        </div>
      ) : null}
    </div>
  );
}

function MobileDayCard({
  day,
  onOpenBlock,
}: {
  day: DayCell;
  onOpenBlock: (block: CalendarBlock) => void;
}) {
  const stats = getDayStats(day.blocks);
  const styles = getExceptionStyle(day.exception);

  return (
    <Link
      href={`/tagesansicht?date=${day.key}`}
      className={`block rounded-[24px] border bg-white p-4 shadow-sm transition hover:shadow-md ${styles.dayClass} ${
        day.inMonth ? "" : "opacity-55"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {day.date.format("dddd")}
          </div>
          <div className="text-sm text-slate-500">
            {day.date.format("DD.MM.YYYY")}
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900">
            {stats.count}
          </div>
          <div className="text-[11px] text-slate-500">Blöcke</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <ExceptionBadge exception={day.exception} />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full ${getLoadColor(stats.totalMinutes)}`}
            style={{
              width: `${Math.min((stats.totalMinutes / 540) * 100, 100)}%`,
            }}
          />
        </div>
        <div className="text-[11px] font-medium text-slate-500">
          {formatHours(stats.totalMinutes)}
        </div>
      </div>

      <div
        onClick={(e) => e.preventDefault()}
        className="space-y-2"
      >
        <DayPreviewList blocks={day.blocks} onOpen={onOpenBlock} />
      </div>
    </Link>
  );
}

function MonthWeekRow({
  week,
  onOpenBlock,
}: {
  week: MonthWeek;
  onOpenBlock: (block: CalendarBlock) => void;
}) {
  const segments = useMemo(() => buildWeekSegments(week), [week]);
  const laneHeight = 62;
  const laneGap = 8;
  const barsTopOffset = 74;
  const barsHeight =
    segments.length > 0
      ? segments[0].laneCount * laneHeight + (segments[0].laneCount - 1) * laneGap
      : 0;
  const rowMinHeight = Math.max(
    DESKTOP_WEEK_MIN_HEIGHT,
    barsTopOffset + barsHeight + 18
  );

  return (
    <div className="relative grid grid-cols-6 overflow-hidden rounded-[28px] border bg-white shadow-sm">
      {week.days.map((day) => {
        const stats = getDayStats(day.blocks);

        return (
          <MonthDropZone key={day.key} day={day}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  {day.date.format("D")}
                </div>
                <div className="text-[11px] text-slate-500">
                  {day.date.format("dd")}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-medium text-slate-900">
                  {stats.count} Block{stats.count === 1 ? "" : "e"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {stats.activeUsers} Pers.
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <ExceptionBadge exception={day.exception} />
            </div>

            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${getLoadColor(stats.totalMinutes)}`}
                  style={{
                    width: `${Math.min((stats.totalMinutes / 540) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {formatHours(stats.totalMinutes)}
              </div>
            </div>

            <div className="pointer-events-none h-[96px]" />

            <div className="mt-4 flex items-center justify-between gap-2">
              {stats.urgentCount > 0 ? (
                <div className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                  {stats.urgentCount} wichtig
                </div>
              ) : (
                <span />
              )}

              <Link
                href={`/tagesansicht?date=${day.key}`}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-900"
              >
                Tag öffnen
              </Link>
            </div>
          </MonthDropZone>
        );
      })}

      <div
        className="pointer-events-none absolute inset-0"
        style={{ minHeight: `${rowMinHeight}px` }}
      >
        {segments.map((segment) => {
          const leftPercent = (segment.startDayIndex / DAYS_PER_WEEK) * 100;
          const widthPercent =
            ((segment.endDayIndex - segment.startDayIndex + 1) / DAYS_PER_WEEK) * 100;

          return (
            <div
              key={`${segment.weekKey}-${segment.block.schedule_block_id}`}
              className="pointer-events-auto absolute px-1"
              style={{
                left: `calc(${leftPercent}% + 8px)`,
                width: `calc(${widthPercent}% - 16px)`,
                top: `${barsTopOffset + segment.lane * (laneHeight + laneGap)}px`,
                height: `${laneHeight}px`,
              }}
            >
              <MonthBarCard segment={segment} onOpen={onOpenBlock} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthViewClient({
  month,
  users,
  blocks,
  exceptions,
}: MonthViewClientProps) {
  const router = useRouter();

  const [activeBlock, setActiveBlock] = useState<CalendarBlock | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const weeks = useMemo(
    () => buildMonthWeeks(month, blocks, exceptions),
    [month, blocks, exceptions]
  );

  const days = useMemo(() => weeks.flatMap((week) => week.days), [weeks]);

  const monthLabel = dayjs(month).format("MMMM YYYY");
  const monthKey = dayjs(month).format("YYYY-MM");

  const monthBlocks = useMemo(
    () =>
      blocks.filter((block) => {
        const blockStart = dayjs(block.block_start);
        const blockEnd = dayjs(block.block_end);
        const monthStart = dayjs(month).startOf("month");
        const monthEnd = dayjs(month).endOf("month").add(1, "day").startOf("day");

        return blockStart.isBefore(monthEnd) && blockEnd.isAfter(monthStart);
      }),
    [blocks, month]
  );

  const monthExceptions = useMemo(
    () =>
      exceptions.filter(
        (item) => dayjs(item.exception_date).format("YYYY-MM") === monthKey
      ),
    [exceptions, monthKey]
  );

  const totalMinutes = useMemo(
    () =>
      monthBlocks.reduce(
        (sum, block) => sum + block.block_duration_minutes,
        0
      ),
    [monthBlocks]
  );

  const totalBlockedDays = monthExceptions.filter(
    (item) => !(item.display_only === 1 || item.exception_type === "info")
  ).length;

  const totalInfoDays = monthExceptions.filter(
    (item) => item.display_only === 1 || item.exception_type === "info"
  ).length;

  const userLoad = useMemo(() => {
    return users.map((user) => {
      const userBlocks = monthBlocks.filter((block) => block.user_id === user.id);
      const userMinutes = userBlocks.reduce(
        (sum, block) => sum + block.block_duration_minutes,
        0
      );

      return {
        ...user,
        count: userBlocks.length,
        userMinutes,
      };
    });
  }, [monthBlocks, users]);

  function handleDragStart(event: DragStartEvent) {
    const block = event.active.data.current?.block as CalendarBlock | undefined;
    setActiveBlock(block ?? null);
    setError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveBlock(null);

    if (!event.over) return;

    const block = event.active.data.current?.block as CalendarBlock | undefined;
    const day = event.over.data.current?.day as DayCell | undefined;

    if (!block || !day) return;

    const targetDate = day.key;
    const originalDate = dayjs(block.block_start).format("YYYY-MM-DD");

    if (originalDate === targetDate) return;

    try {
      setSaving(true);
      setError(null);

      const newStart = dayjs(
        `${targetDate} ${dayjs(block.block_start).format("HH:mm:ss")}`
      ).format("YYYY-MM-DD HH:mm:ss");

      const response = await fetch("/api/schedule-blocks/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId: block.schedule_block_id,
          userId: block.user_id,
          start: newStart,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Verschieben fehlgeschlagen.");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Verschieben fehlgeschlagen."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="g98-panel">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="g98-section-title">Monatsüberblick</h2>
            <p className="g98-section-subtitle">{monthLabel}</p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-2xl border bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Blöcke
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {monthBlocks.length}
              </div>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Stunden
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {formatHours(totalMinutes)}
              </div>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Feiertage
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {totalBlockedDays}
              </div>
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Info
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {totalInfoDays}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {userLoad.map((user) => {
            const theme = getEmployeeTheme({
              userId: user.id,
              userName: user.name,
            });

            return (
              <div
                key={user.id}
                className="rounded-[24px] border bg-white p-4"
                style={{ borderColor: theme.border }}
              >
                <div className="mb-2 flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-2xl"
                    style={{ backgroundColor: theme.solid }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {user.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {user.count} Block{user.count === 1 ? "" : "e"}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-medium text-slate-500">
                  {formatHours(user.userMinutes)} im Monat
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {saving ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          Termin wird verschoben ...
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:hidden">
        {days.map((day) => (
          <MobileDayCard
            key={day.key}
            day={day}
            onOpenBlock={setSelectedBlock}
          />
        ))}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <section className="hidden rounded-[30px] border bg-white p-4 shadow-sm xl:block xl:p-6">
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Monatsansicht jetzt mit robusten mehrtägigen Balken, Wochen-Lanes und
            konsistentem Drag & Drop.
          </div>

          <div className="mb-3 grid grid-cols-6 gap-0 overflow-hidden rounded-[24px] border">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-r bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {weeks.map((week) => (
              <MonthWeekRow
                key={week.key}
                week={week}
                onOpenBlock={setSelectedBlock}
              />
            ))}
          </div>

          <DragOverlay>
            {activeBlock ? <DragOverlayCard block={activeBlock} /> : null}
          </DragOverlay>
        </section>
      </DndContext>

      {selectedBlock ? (
        <div className="rounded-[24px] border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {selectedBlock.title}
              </div>
              <div className="text-sm text-slate-500">
                {selectedBlock.customer_name}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedBlock(null)}
              className="rounded-full border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Schließen
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Zeitraum
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {dayjs(selectedBlock.block_start).format("DD.MM.YYYY HH:mm")} –{" "}
                {dayjs(selectedBlock.block_end).format("DD.MM.YYYY HH:mm")}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Mitarbeiter:in
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {selectedBlock.user_name}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Status
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {getStatusLabel(selectedBlock.block_status)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Arbeitsart
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {selectedBlock.task_type_name || "Ohne Arbeitsart"}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Link
              href={`/tagesansicht?date=${dayjs(selectedBlock.block_start).format("YYYY-MM-DD")}`}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Zum betreffenden Tag
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
