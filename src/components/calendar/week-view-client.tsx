"use client";

import dayjs from "@/lib/dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useMemo, useState } from "react";
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

import { BlockDetailsSheet } from "@/components/calendar/block-details-sheet";
import type { CalendarBlock } from "@/types/calendar";
import type { CalendarException } from "@/lib/calendar";
import {
  formatHours,
  getEmployeeTheme,
  getStatusLabel,
  getStatusTheme,
  getTaskTheme,
} from "@/lib/ui-theme";

dayjs.extend(isoWeek);

type UserColumn = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

type WeekViewClientProps = {
  weekStart: string;
  users: UserColumn[];
  taskTypes: TaskTypeOption[];
  blocks: CalendarBlock[];
  exceptions: CalendarException[];
};

type DayGroup = {
  date: dayjs.Dayjs;
  key: string;
  blocks: CalendarBlock[];
  exception: CalendarException | null;
};

function formatHourLabel(start: string, end: string) {
  return `${dayjs(start).format("HH:mm")}–${dayjs(end).format("HH:mm")}`;
}

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

function groupBlocksByDay(
  blocks: CalendarBlock[],
  weekStart: string,
  exceptions: CalendarException[]
): DayGroup[] {
  const days = Array.from({ length: 6 }, (_, index) =>
    dayjs(weekStart).add(index, "day")
  );

  const exceptionMap = new Map(
    exceptions.map((item) => [item.exception_date, item])
  );

  return days.map((day) => {
    const dayKey = day.format("YYYY-MM-DD");

    const dayBlocks = blocks
      .filter((block) => dayjs(block.block_start).format("YYYY-MM-DD") === dayKey)
      .sort((a, b) => dayjs(a.block_start).unix() - dayjs(b.block_start).unix());

    return {
      date: day,
      key: dayKey,
      blocks: dayBlocks,
      exception: exceptionMap.get(dayKey) ?? null,
    };
  });
}

function parseDropCellId(value: string) {
  const match = /^week-cell-(\d+)-(\d{4}-\d{2}-\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  return {
    userId: Number(match[1]),
    targetDate: match[2],
    hour: Number(match[3]),
  };
}

function CleanWeekMetaLine({ block }: { block: CalendarBlock }) {
  const taskTheme = getTaskTheme({
    taskName: block.task_type_name,
    taskColor: block.task_type_color,
  });
  const statusTheme = getStatusTheme(block.block_status);

  return (
    <div className="mt-2 min-w-0 space-y-1 text-[11px] text-slate-500">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: statusTheme.solid }}
        />
        <span className="truncate">{getStatusLabel(block.block_status)}</span>
      </div>

      <div className="min-w-0 truncate" style={{ color: taskTheme.text }}>
        {block.task_type_name || "Ohne Arbeitsart"}
      </div>

      <div className="min-w-0 truncate text-slate-400">{block.user_name}</div>
    </div>
  );
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

function WeekMobileBlockCard({
  block,
  onOpen,
}: {
  block: CalendarBlock;
  onOpen: (block: CalendarBlock) => void;
}) {
  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  return (
    <button
      type="button"
      onClick={() => onOpen(block)}
      className="w-full rounded-[22px] border bg-white p-4 text-left shadow-sm transition hover:shadow-md"
      style={{
        borderLeftWidth: "6px",
        borderLeftColor: employeeTheme.solid,
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {block.title}
          </div>
          <div className="truncate text-xs text-slate-500">
            {block.customer_name}
          </div>
        </div>

        <div className="shrink-0 text-[11px] font-medium text-slate-500">
          {formatHourLabel(block.block_start, block.block_end)}
        </div>
      </div>

      <CleanWeekMetaLine block={block} />
    </button>
  );
}

function DesktopWeekBlockCard({
  block,
  onOpen,
}: {
  block: CalendarBlock;
  onOpen: (block: CalendarBlock) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `week-block-${block.schedule_block_id}`,
      data: { block },
    });

  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderColor: employeeTheme.border,
      }
    : {
        borderColor: employeeTheme.border,
      };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative cursor-grab rounded-[22px] border bg-white p-3 text-left shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
      onDoubleClick={() => onOpen(block)}
      aria-label={`${block.title} verschieben`}
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5 rounded-l-[22px]"
        style={{ backgroundColor: employeeTheme.solid }}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(block);
        }}
        className="relative block w-full min-w-0 pl-2 text-left"
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
            {formatHourLabel(block.block_start, block.block_end)}
          </div>
        </div>

        <CleanWeekMetaLine block={block} />

        <div className="mt-2 text-[11px] text-slate-400">
          {formatHours(block.block_duration_minutes)}
        </div>
      </button>
    </div>
  );
}

function DropSlot({
  id,
  label,
  userName,
  userId,
}: {
  id: string;
  label: string;
  userName: string;
  userId: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const theme = getEmployeeTheme({ userId, userName });

  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl border border-dashed px-3 py-2 text-xs transition"
      style={{
        borderColor: isOver ? theme.solid : theme.border,
        backgroundColor: isOver ? theme.soft : "#ffffff",
        color: isOver ? theme.text : "#64748b",
      }}
    >
      {label}
    </div>
  );
}

function DragPreviewCard({ block }: { block: CalendarBlock }) {
  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  return (
    <div
      className="relative w-[290px] rounded-[22px] border bg-white p-3 shadow-xl"
      style={{ borderColor: employeeTheme.border }}
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5 rounded-l-[22px]"
        style={{ backgroundColor: employeeTheme.solid }}
      />
      <div className="pl-2">
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
            {formatHourLabel(block.block_start, block.block_end)}
          </div>
        </div>

        <CleanWeekMetaLine block={block} />

        <div className="mt-2 text-[11px] text-slate-400">
          {formatHours(block.block_duration_minutes)}
        </div>
      </div>
    </div>
  );
}

export function WeekViewClient({
  weekStart,
  users,
  taskTypes,
  blocks,
  exceptions,
}: WeekViewClientProps) {
  const router = useRouter();

  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | "all">("all");
  const [activeBlock, setActiveBlock] = useState<CalendarBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const filteredBlocks =
    selectedUserId === "all"
      ? blocks
      : blocks.filter((block) => block.user_id === selectedUserId);

  const filteredDays = useMemo(
    () => groupBlocksByDay(filteredBlocks, weekStart, exceptions),
    [filteredBlocks, weekStart, exceptions]
  );

  const userLoad = useMemo(() => {
    return users.map((user) => {
      const userBlocks = blocks.filter((block) => block.user_id === user.id);
      const totalMinutes = userBlocks.reduce(
        (sum, block) => sum + block.block_duration_minutes,
        0
      );

      return {
        ...user,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        count: userBlocks.length,
        activeCount: userBlocks.filter((block) => block.block_status === "in_arbeit")
          .length,
        pausedCount: userBlocks.filter((block) => block.block_status === "pausiert")
          .length,
      };
    });
  }, [blocks, users]);

  function handleDragStart(event: DragStartEvent) {
    const block = event.active.data.current?.block as CalendarBlock | undefined;
    setActiveBlock(block ?? null);
    setError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveBlock(null);

    if (!event.over) return;

    const block = event.active.data.current?.block as CalendarBlock | undefined;
    if (!block) return;

    const parsed = parseDropCellId(String(event.over.id));
    if (!parsed) return;

    const newStart = dayjs(
      `${parsed.targetDate} ${String(parsed.hour).padStart(2, "0")}:00:00`
    ).format("YYYY-MM-DD HH:mm:ss");

    try {
      setSaving(true);
      setError(null);

      const response = await fetch("/api/schedule-blocks/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blockId: block.schedule_block_id,
          userId: parsed.userId,
          start: newStart,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Verschieben fehlgeschlagen.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verschieben fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {saving ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          Speichere Verschiebung ...
        </div>
      ) : null}

      <section className="g98-panel">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="g98-section-title">Wochenüberblick</h2>
            <p className="g98-section-subtitle">
              {dayjs(weekStart).format("DD.MM.YYYY")} –{" "}
              {dayjs(weekStart).add(5, "day").format("DD.MM.YYYY")}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedUserId("all")}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${
                selectedUserId === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              Alle
            </button>

            {users.map((user) => {
              const theme = getEmployeeTheme({
                userId: user.id,
                userName: user.name,
              });

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium"
                  style={{
                    backgroundColor:
                      selectedUserId === user.id ? theme.solid : "#ffffff",
                    color: selectedUserId === user.id ? "#ffffff" : theme.text,
                    borderColor:
                      selectedUserId === user.id ? theme.solid : theme.border,
                  }}
                >
                  {user.name}
                </button>
              );
            })}
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
                  {user.totalHours} h diese Woche
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                    Aktiv: {user.activeCount}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                    Pausiert: {user.pausedCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:hidden">
        {filteredDays.map((day) => {
          const styles = getExceptionStyle(day.exception);

          return (
            <section key={day.key} className={`g98-panel ${styles.dayClass}`}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {day.date.format("dddd")}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {day.date.format("DD.MM.YYYY")}
                  </p>
                </div>

                <div className="text-xs font-medium text-slate-500">
                  {day.blocks.length} Block{day.blocks.length === 1 ? "" : "e"}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <ExceptionBadge exception={day.exception} />
              </div>

              {day.blocks.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Keine Einträge
                </div>
              ) : (
                <div className="space-y-3">
                  {day.blocks.map((block) => (
                    <WeekMobileBlockCard
                      key={block.schedule_block_id}
                      block={block}
                      onOpen={setSelectedBlock}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <section className="hidden rounded-[30px] border bg-white p-4 shadow-sm lg:block lg:p-6">
          <div className="overflow-x-auto">
            <div className="grid min-w-[1200px] grid-cols-6 gap-4">
              {filteredDays.map((day) => {
                const styles = getExceptionStyle(day.exception);

                return (
                  <div key={day.key} className="min-w-0">
                    <div className={`mb-3 rounded-[22px] bg-slate-50 px-4 py-3 ${styles.dayClass}`}>
                      <div className="text-sm font-semibold text-slate-900">
                        {day.date.format("dddd")}
                      </div>
                      <div className="text-xs text-slate-500">
                        {day.date.format("DD.MM.YYYY")}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        {day.blocks.length} Block{day.blocks.length === 1 ? "" : "e"}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <ExceptionBadge exception={day.exception} />
                      </div>
                    </div>

                    <div className="mb-3 grid gap-2">
                      {users.map((user) => (
                        <DropSlot
                          key={`${day.key}-${user.id}`}
                          id={`week-cell-${user.id}-${day.key}-08`}
                          label={`${user.name} · 08:00`}
                          userName={user.name}
                          userId={user.id}
                        />
                      ))}
                    </div>

                    <div className="space-y-3">
                      {day.blocks.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          Frei
                        </div>
                      ) : (
                        day.blocks.map((block) => (
                          <DesktopWeekBlockCard
                            key={block.schedule_block_id}
                            block={block}
                            onOpen={setSelectedBlock}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeBlock ? <DragPreviewCard block={activeBlock} /> : null}
          </DragOverlay>
        </section>
      </DndContext>

      <BlockDetailsSheet
        block={selectedBlock}
        open={!!selectedBlock}
        onClose={() => setSelectedBlock(null)}
        users={users}
        taskTypes={taskTypes}
      />
    </div>
  );
}