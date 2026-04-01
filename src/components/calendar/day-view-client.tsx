"use client";

import dayjs from "dayjs";
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

type UserColumn = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

type DayViewClientProps = {
  date: string;
  users: UserColumn[];
  taskTypes: TaskTypeOption[];
  blocks: CalendarBlock[];
  exceptions: CalendarException[];
};

const START_HOUR = 8;
const END_HOUR = 17;
const PIXELS_PER_MINUTE = 1.15;
const CALENDAR_HEIGHT = (END_HOUR - START_HOUR) * 60 * PIXELS_PER_MINUTE;

function formatTime(value: string) {
  return dayjs(value).format("HH:mm");
}

function getMinutesFromCalendarStart(value: string) {
  const d = dayjs(value);
  return (d.hour() - START_HOUR) * 60 + d.minute();
}

function getBlockStyle(block: CalendarBlock) {
  const top = getMinutesFromCalendarStart(block.block_start) * PIXELS_PER_MINUTE;
  const height = Math.max(block.block_duration_minutes * PIXELS_PER_MINUTE, 58);

  return {
    top: `${top}px`,
    height: `${height}px`,
  };
}

function getDayException(exception: CalendarException | null) {
  if (!exception) {
    return {
      isBlocked: false,
      chipClass: "bg-slate-50 text-slate-500 border-slate-200",
      panelClass: "",
    };
  }

  if (exception.display_only === 1 || exception.exception_type === "info") {
    return {
      isBlocked: false,
      chipClass: "bg-sky-50 text-sky-700 border-sky-200",
      panelClass: "ring-1 ring-sky-100",
    };
  }

  return {
    isBlocked: true,
    chipClass: "bg-red-50 text-red-700 border-red-200",
    panelClass: "ring-1 ring-red-100 bg-red-50/20",
  };
}

function CleanMetaLine({ block }: { block: CalendarBlock }) {
  const taskTheme = getTaskTheme({
    taskName: block.task_type_name,
    taskColor: block.task_type_color,
  });
  const statusTheme = getStatusTheme(block.block_status);

  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: statusTheme.solid }}
      />
      <span>{getStatusLabel(block.block_status)}</span>
      <span className="text-slate-300">•</span>
      <span style={{ color: taskTheme.text }}>
        {block.task_type_name || "Ohne Arbeitsart"}
      </span>
      <span className="text-slate-300">•</span>
      <span>{formatHours(block.block_duration_minutes)}</span>
    </div>
  );
}

function BlockCardContent({ block }: { block: CalendarBlock }) {
  return (
    <div className="pl-2">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-5 text-slate-900">
            {block.title}
          </div>
          <div className="truncate text-xs text-slate-500">
            {block.customer_name}
          </div>
        </div>

        <div className="shrink-0 text-[11px] font-medium text-slate-500">
          {formatTime(block.block_start)}–{formatTime(block.block_end)}
        </div>
      </div>

      <CleanMetaLine block={block} />
    </div>
  );
}

function DraggableBlockCard({
  block,
  onOpen,
}: {
  block: CalendarBlock;
  onOpen: (block: CalendarBlock) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `block-${block.schedule_block_id}`,
      data: { block },
    });

  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onOpen(block)}
      className={`absolute left-2 right-2 cursor-grab overflow-hidden rounded-[22px] border bg-white p-3 shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
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
        className="absolute inset-0 z-0"
        aria-label={`Details zu ${block.title} öffnen`}
      />

      <div className="pointer-events-none relative z-10">
        <BlockCardContent block={block} />
      </div>
    </div>
  );
}

function DragPreviewCard({ block }: { block: CalendarBlock }) {
  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  return (
    <div className="relative w-[290px] overflow-hidden rounded-[22px] border bg-white p-3 shadow-xl">
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5"
        style={{ backgroundColor: employeeTheme.solid }}
      />
      <div className="relative">
        <BlockCardContent block={block} />
      </div>
    </div>
  );
}

function DropCell({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 border-t border-slate-100 transition-colors ${
        isOver ? "bg-sky-50/70" : ""
      }`}
      style={{ height: `${60 * PIXELS_PER_MINUTE}px` }}
    />
  );
}

function parseDropCellId(value: string) {
  const match = /^cell-(\d+)-(\d{4}-\d{2}-\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  return {
    userId: Number(match[1]),
    targetDate: match[2],
    hour: Number(match[3]),
  };
}

function MobileBlockCard({
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

        <div className="shrink-0 text-xs font-medium text-slate-500">
          {formatTime(block.block_start)}–{formatTime(block.block_end)}
        </div>
      </div>

      <CleanMetaLine block={block} />
    </button>
  );
}

export function DayViewClient({
  date,
  users,
  taskTypes,
  blocks,
  exceptions,
}: DayViewClientProps) {
  const router = useRouter();

  const [activeBlock, setActiveBlock] = useState<CalendarBlock | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    users[0]?.id ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  const dayException = exceptions[0] ?? null;
  const exceptionStyle = getDayException(dayException);

  const activeUserId = selectedUserId ?? users[0]?.id ?? null;

  const mobileBlocks = blocks
    .filter((block) => (activeUserId ? block.user_id === activeUserId : true))
    .sort((a, b) => dayjs(a.block_start).unix() - dayjs(b.block_start).unix());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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
      {dayException ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${exceptionStyle.chipClass}`}
          title={dayException.notes ?? dayException.name}
        >
          <span className="font-medium">{dayException.name}</span>
          {exceptionStyle.isBlocked ? " · gesperrter Tag" : " · Info"}
        </div>
      ) : null}

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

      <section className={`g98-panel ${exceptionStyle.panelClass}`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="g98-section-title">Tagesansicht</h2>
            <p className="g98-section-subtitle">
              {dayjs(date).format("DD.MM.YYYY")}
            </p>
          </div>

          <div className="text-sm text-slate-500">
            {blocks.length} Block{blocks.length === 1 ? "" : "e"} geplant
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {users.map((user) => {
            const active = activeUserId === user.id;
            const count = blocks.filter((block) => block.user_id === user.id).length;
            const theme = getEmployeeTheme({ userId: user.id, userName: user.name });

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: active ? theme.solid : "#ffffff",
                  color: active ? "#ffffff" : theme.text,
                  borderColor: active ? theme.solid : theme.border,
                }}
              >
                {user.name} · {count}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:hidden">
          {mobileBlocks.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Keine Einträge für {users.find((user) => user.id === activeUserId)?.name ?? "diese Person"}.
            </div>
          ) : (
            mobileBlocks.map((block) => (
              <MobileBlockCard
                key={block.schedule_block_id}
                block={block}
                onOpen={setSelectedBlock}
              />
            ))
          )}
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="hidden lg:block">
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[1080px]"
                style={{
                  gridTemplateColumns: `90px repeat(${users.length}, minmax(300px, 1fr))`,
                }}
              >
                <div className="border-r border-b bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                  Zeit
                </div>

                {users.map((user) => {
                  const theme = getEmployeeTheme({
                    userId: user.id,
                    userName: user.name,
                  });
                  const userBlocks = blocks.filter((block) => block.user_id === user.id);
                  const totalMinutes = userBlocks.reduce(
                    (sum, block) => sum + block.block_duration_minutes,
                    0
                  );

                  return (
                    <div
                      key={user.id}
                      className="border-b border-r bg-white px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-10 w-10 rounded-2xl"
                            style={{ backgroundColor: theme.solid }}
                          />
                          <div>
                            <div className="text-sm font-semibold text-slate-800">
                              {user.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {userBlocks.length} Block{userBlocks.length === 1 ? "" : "e"}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs font-medium text-slate-500">
                          {formatHours(totalMinutes)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="relative border-r bg-white">
                  <div style={{ height: `${CALENDAR_HEIGHT}px` }}>
                    {hours.map((hour, index) => {
                      const top = index * 60 * PIXELS_PER_MINUTE;

                      return (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-t text-xs text-slate-400"
                          style={{ top: `${top}px` }}
                        >
                          <div className="-translate-y-1/2 px-3">{`${hour}:00`}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {users.map((user) => {
                  const userBlocks = blocks.filter((block) => block.user_id === user.id);

                  return (
                    <div
                      key={user.id}
                      className="relative border-r bg-white"
                    >
                      <div
                        className="relative"
                        style={{ height: `${CALENDAR_HEIGHT}px` }}
                      >
                        {hours.map((hour, index) => {
                          const top = index * 60 * PIXELS_PER_MINUTE;

                          return (
                            <div
                              key={`${user.id}-${hour}`}
                              style={{ top: `${top}px` }}
                            >
                              <DropCell
                                id={`cell-${user.id}-${date}-${String(hour).padStart(2, "0")}`}
                              />
                            </div>
                          );
                        })}

                        {hours.map((hour, index) => {
                          const top = index * 60 * PIXELS_PER_MINUTE;

                          return (
                            <div
                              key={`line-${user.id}-${hour}`}
                              className="absolute left-0 right-0 border-t border-slate-100"
                              style={{ top: `${top}px` }}
                            />
                          );
                        })}

                        {userBlocks.map((block) => (
                          <div
                            key={block.schedule_block_id}
                            className="absolute left-0 right-0"
                            style={getBlockStyle(block)}
                          >
                            <DraggableBlockCard
                              block={block}
                              onOpen={setSelectedBlock}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DragOverlay>
              {activeBlock ? <DragPreviewCard block={activeBlock} /> : null}
            </DragOverlay>
          </div>
        </DndContext>
      </section>

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