"use client";

import Link from "next/link";
import dayjs from "dayjs";
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
import { formatHours, getEmployeeTheme, getTaskTheme } from "@/lib/ui-theme";

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
};

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function buildMonthDays(
  month: string,
  blocks: CalendarBlock[],
  exceptions: CalendarException[]
): DayCell[] {
  const monthStart = dayjs(month).startOf("month");
  const monthEnd = dayjs(month).endOf("month");
  const exceptionMap = new Map(exceptions.map((item) => [item.exception_date, item]));
  const days: DayCell[] = [];

  for (
    let cursor = monthStart.startOf("week").add(1, "day");
    cursor.isBefore(monthEnd.endOf("week")) || cursor.isSame(monthEnd.endOf("week"), "day");
    cursor = cursor.add(1, "day")
  ) {
    if (cursor.day() === 0) continue;
    const key = cursor.format("YYYY-MM-DD");
    const dayBlocks = blocks
      .filter((block) => dayjs(block.block_start).format("YYYY-MM-DD") === key)
      .sort((a, b) => dayjs(a.block_start).unix() - dayjs(b.block_start).unix());
    days.push({ date: cursor, key, blocks: dayBlocks, exception: exceptionMap.get(key) ?? null });
  }

  return days;
}

function getDayStats(blocks: CalendarBlock[]) {
  const totalMinutes = blocks.reduce((sum, block) => sum + block.block_duration_minutes, 0);
  const urgentCount = blocks.filter((block) => block.priority === "hoch" || block.priority === "dringend").length;
  const activeUsers = new Set(blocks.map((block) => block.user_id)).size;
  return { totalMinutes, urgentCount, activeUsers, count: blocks.length };
}

function getLoadColor(totalMinutes: number) {
  if (totalMinutes >= 8 * 60) return "bg-slate-900";
  if (totalMinutes >= 5 * 60) return "bg-slate-600";
  if (totalMinutes >= 2 * 60) return "bg-slate-400";
  return "bg-slate-200";
}

function getExceptionStyle(exception: CalendarException | null) {
  if (!exception) {
    return { chipClass: "bg-slate-50 text-slate-500 border-slate-200", dayClass: "" };
  }
  if (exception.display_only === 1 || exception.exception_type === "info") {
    return { chipClass: "bg-sky-50 text-sky-700 border-sky-200", dayClass: "ring-1 ring-sky-100" };
  }
  return { chipClass: "bg-red-50 text-red-700 border-red-200", dayClass: "ring-1 ring-red-100 bg-red-50/20" };
}

function ExceptionBadge({ exception }: { exception: CalendarException | null }) {
  if (!exception) return null;
  const styles = getExceptionStyle(exception);
  return (
    <div className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles.chipClass}`} title={exception.notes ?? exception.name}>
      <span className="truncate">{exception.name}</span>
    </div>
  );
}

function DraggablePreviewCard({ block }: { block: CalendarBlock }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `month-block-${block.schedule_block_id}`,
    data: { block },
  });
  const employeeTheme = getEmployeeTheme({ userId: block.user_id, userName: block.user_name });
  const taskTheme = getTaskTheme({ taskName: block.task_type_name, taskColor: block.task_type_color });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`rounded-2xl border bg-white px-3 py-2 shadow-sm ${isDragging ? "opacity-50" : "cursor-grab active:cursor-grabbing"}`}
      style={{ ...(style || {}), borderColor: employeeTheme.border }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-900">{block.title}</div>
          <div className="truncate text-[11px] text-slate-500">{block.customer_name}</div>
        </div>
        <div className="shrink-0 text-[11px] font-medium text-slate-400">{dayjs(block.block_start).format("HH:mm")}</div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: employeeTheme.solid }} />
        <span className="truncate text-slate-500">{block.user_name}</span>
        <span className="text-slate-300">•</span>
        <span className="truncate" style={{ color: taskTheme.text }}>{block.task_type_name || "Ohne Arbeitsart"}</span>
      </div>
    </div>
  );
}

function DragOverlayCard({ block }: { block: CalendarBlock }) {
  return <div className="w-[270px]"><DraggablePreviewCard block={block} /></div>;
}

function DayPreviewList({ blocks }: { blocks: CalendarBlock[] }) {
  const preview = blocks.slice(0, 3);
  if (preview.length === 0) return <div className="text-xs text-slate-400">Frei</div>;
  return (
    <div className="space-y-2">
      {preview.map((block) => (
        <DraggablePreviewCard key={block.schedule_block_id} block={block} />
      ))}
      {blocks.length > 3 ? <div className="text-[11px] font-medium text-slate-400">+{blocks.length - 3} weitere</div> : null}
    </div>
  );
}

function MobileDayCard({ day, month }: { day: DayCell; month: string }) {
  const stats = getDayStats(day.blocks);
  const inMonth = day.date.format("YYYY-MM") === dayjs(month).format("YYYY-MM");
  const styles = getExceptionStyle(day.exception);
  return (
    <Link href={`/tagesansicht?date=${day.key}`} className={`block rounded-[24px] border bg-white p-4 shadow-sm transition hover:shadow-md ${inMonth ? "" : "opacity-55"} ${styles.dayClass}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{day.date.format("dddd")}</div>
          <div className="text-sm text-slate-500">{day.date.format("DD.MM.YYYY")}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900">{stats.count}</div>
          <div className="text-[11px] text-slate-500">Blöcke</div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2"><ExceptionBadge exception={day.exception} /></div>
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-slate-100">
          <div className={`h-2 rounded-full ${getLoadColor(stats.totalMinutes)}`} style={{ width: `${Math.min((stats.totalMinutes / 540) * 100, 100)}%` }} />
        </div>
        <div className="text-[11px] font-medium text-slate-500">{formatHours(stats.totalMinutes)}</div>
      </div>
      <div className="space-y-2">
        {day.blocks.slice(0, 3).map((block) => {
          const employeeTheme = getEmployeeTheme({ userId: block.user_id, userName: block.user_name });
          return (
            <div key={block.schedule_block_id} className="rounded-2xl border bg-white px-3 py-2" style={{ borderColor: employeeTheme.border }}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900">{block.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{block.customer_name}</div>
                </div>
                <div className="shrink-0 text-[11px] font-medium text-slate-400">{dayjs(block.block_start).format("HH:mm")}</div>
              </div>
            </div>
          );
        })}
        {day.blocks.length === 0 ? <div className="text-xs text-slate-400">Frei</div> : null}
      </div>
    </Link>
  );
}

function MonthDropZone({ day, children, inMonth }: { day: DayCell; children: ReactNode; inMonth: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `month-day-${day.key}`, data: { day } });
  const styles = getExceptionStyle(day.exception);
  return (
    <div ref={setNodeRef} className={`min-h-[240px] rounded-[24px] border bg-white p-4 transition hover:shadow-md ${inMonth ? "" : "opacity-50"} ${styles.dayClass} ${isOver ? "ring-2 ring-sky-300" : ""}`}>
      {children}
    </div>
  );
}

export function MonthViewClient({ month, users, blocks, exceptions }: MonthViewClientProps) {
  const router = useRouter();
  const [activeBlock, setActiveBlock] = useState<CalendarBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const days = useMemo(() => buildMonthDays(month, blocks, exceptions), [month, blocks, exceptions]);
  const monthLabel = dayjs(month).format("MMMM YYYY");
  const monthKey = dayjs(month).format("YYYY-MM");
  const monthBlocks = blocks.filter((block) => dayjs(block.block_start).format("YYYY-MM") === monthKey);
  const monthExceptions = exceptions.filter((item) => dayjs(item.exception_date).format("YYYY-MM") === monthKey);
  const totalMinutes = monthBlocks.reduce((sum, block) => sum + block.block_duration_minutes, 0);
  const totalBlockedDays = monthExceptions.filter((item) => !(item.display_only === 1 || item.exception_type === "info")).length;
  const totalInfoDays = monthExceptions.filter((item) => item.display_only === 1 || item.exception_type === "info").length;

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

      const newStart = dayjs(`${targetDate} ${dayjs(block.block_start).format("HH:mm:ss")}`).format("YYYY-MM-DD HH:mm:ss");
      const response = await fetch("/api/schedule-blocks/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: block.schedule_block_id, userId: block.user_id, start: newStart }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Verschieben fehlgeschlagen.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verschieben fehlgeschlagen.");
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
            <div className="rounded-2xl border bg-white px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Blöcke</div><div className="mt-1 text-lg font-semibold text-slate-900">{monthBlocks.length}</div></div>
            <div className="rounded-2xl border bg-white px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Stunden</div><div className="mt-1 text-lg font-semibold text-slate-900">{formatHours(totalMinutes)}</div></div>
            <div className="rounded-2xl border bg-white px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Feiertage</div><div className="mt-1 text-lg font-semibold text-slate-900">{totalBlockedDays}</div></div>
            <div className="rounded-2xl border bg-white px-4 py-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Info</div><div className="mt-1 text-lg font-semibold text-slate-900">{totalInfoDays}</div></div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {users.map((user) => {
            const theme = getEmployeeTheme({ userId: user.id, userName: user.name });
            const userBlocks = monthBlocks.filter((block) => block.user_id === user.id);
            const userMinutes = userBlocks.reduce((sum, block) => sum + block.block_duration_minutes, 0);
            return (
              <div key={user.id} className="rounded-[24px] border bg-white p-4" style={{ borderColor: theme.border }}>
                <div className="mb-2 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl" style={{ backgroundColor: theme.solid }} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{user.name}</div>
                    <div className="text-xs text-slate-500">{userBlocks.length} Block{userBlocks.length === 1 ? "" : "e"}</div>
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500">{formatHours(userMinutes)} im Monat</div>
              </div>
            );
          })}
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {saving ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">Termin wird verschoben ...</div> : null}

      <div className="grid gap-4 xl:hidden">
        {days.map((day) => <MobileDayCard key={day.key} day={day} month={month} />)}
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <section className="hidden rounded-[30px] border bg-white p-4 shadow-sm xl:block xl:p-6">
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Drag & Drop aktiv: Block greifen und auf einen anderen Tag ziehen.
          </div>
          <div className="grid grid-cols-6 gap-3">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{label}</div>
            ))}
            {days.map((day) => {
              const stats = getDayStats(day.blocks);
              const inMonth = day.date.format("YYYY-MM") === dayjs(month).format("YYYY-MM");
              return (
                <MonthDropZone key={day.key} day={day} inMonth={inMonth}>
                  <div className={`${inMonth ? "" : "opacity-50"}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-900">{day.date.format("D")}</div>
                        <div className="text-[11px] text-slate-500">{day.date.format("dd")}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium text-slate-900">{stats.count} Block{stats.count === 1 ? "" : "e"}</div>
                        <div className="text-[11px] text-slate-400">{stats.activeUsers} Pers.</div>
                      </div>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2"><ExceptionBadge exception={day.exception} /></div>
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${getLoadColor(stats.totalMinutes)}`} style={{ width: `${Math.min((stats.totalMinutes / 540) * 100, 100)}%` }} />
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">{formatHours(stats.totalMinutes)}</div>
                    </div>
                    <DayPreviewList blocks={day.blocks} />
                    <div className="mt-4 flex items-center justify-between gap-2">
                      {stats.urgentCount > 0 ? <div className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">{stats.urgentCount} wichtig</div> : <span />}
                      <Link href={`/tagesansicht?date=${day.key}`} className="text-[11px] font-medium text-slate-500 hover:text-slate-900">Tag öffnen</Link>
                    </div>
                  </div>
                </MonthDropZone>
              );
            })}
          </div>
        </section>
        <DragOverlay>{activeBlock ? <DragOverlayCard block={activeBlock} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
