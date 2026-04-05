"use client";

import dayjs from "@/lib/dayjs";
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

type BlockSequenceInfo = {
  totalOrderMinutes: number;
  totalOrderBlocks: number;
  currentBlockIndex: number;
  isMultiBlockOrder: boolean;
  hasPreviousBlock: boolean;
  hasNextBlock: boolean;
  previousBlockDate: string | null;
  nextBlockDate: string | null;
};

const START_HOUR = 8;
const END_HOUR = 17;
const SLOT_MINUTES = 15;
const PIXELS_PER_MINUTE = 1.15;
const MIN_BLOCK_HEIGHT = 58;

const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
const TOTAL_SLOTS = TOTAL_MINUTES / SLOT_MINUTES;
const CALENDAR_HEIGHT = TOTAL_MINUTES * PIXELS_PER_MINUTE;

function formatTime(value: string) {
  return dayjs(value).format("HH:mm");
}

function formatDateLabel(value: string) {
  return dayjs(value).format("DD.MM.");
}

function getMinutesFromCalendarStart(value: string) {
  const d = dayjs(value);
  return (d.hour() - START_HOUR) * 60 + d.minute();
}

function clampMinutesToCalendar(minutes: number) {
  return Math.max(0, Math.min(minutes, TOTAL_MINUTES));
}

function getBlockStyle(block: CalendarBlock) {
  const rawTop = getMinutesFromCalendarStart(block.block_start);
  const rawBottom = rawTop + block.block_duration_minutes;

  const topMinutes = clampMinutesToCalendar(rawTop);
  const bottomMinutes = clampMinutesToCalendar(rawBottom);

  const renderedDuration = Math.max(bottomMinutes - topMinutes, 0);
  const top = topMinutes * PIXELS_PER_MINUTE;
  const height = Math.max(renderedDuration * PIXELS_PER_MINUTE, MIN_BLOCK_HEIGHT);

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

function getOrderBlocks(allBlocks: CalendarBlock[], block: CalendarBlock) {
  return allBlocks
    .filter((item) => item.order_id === block.order_id && item.user_id === block.user_id)
    .sort((a, b) => dayjs(a.block_start).valueOf() - dayjs(b.block_start).valueOf());
}

function getBlockSequenceInfo(
  block: CalendarBlock,
  allBlocks: CalendarBlock[]
): BlockSequenceInfo {
  const orderBlocks = getOrderBlocks(allBlocks, block);
  const currentIndex = orderBlocks.findIndex(
    (item) => item.schedule_block_id === block.schedule_block_id
  );

  const totalOrderMinutes =
    block.order_estimated_duration_minutes && block.order_estimated_duration_minutes > 0
      ? block.order_estimated_duration_minutes
      : orderBlocks.reduce((sum, item) => sum + item.block_duration_minutes, 0);

  const previousBlock = currentIndex > 0 ? orderBlocks[currentIndex - 1] : null;
  const nextBlock =
    currentIndex >= 0 && currentIndex < orderBlocks.length - 1
      ? orderBlocks[currentIndex + 1]
      : null;

  return {
    totalOrderMinutes,
    totalOrderBlocks: orderBlocks.length,
    currentBlockIndex: currentIndex >= 0 ? currentIndex + 1 : 1,
    isMultiBlockOrder: orderBlocks.length > 1,
    hasPreviousBlock: !!previousBlock,
    hasNextBlock: !!nextBlock,
    previousBlockDate: previousBlock
      ? dayjs(previousBlock.block_start).format("YYYY-MM-DD")
      : null,
    nextBlockDate: nextBlock
      ? dayjs(nextBlock.block_start).format("YYYY-MM-DD")
      : null,
  };
}

function ContinuationBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      {label}
    </span>
  );
}

function CleanMetaLine({
  block,
  allBlocks,
}: {
  block: CalendarBlock;
  allBlocks: CalendarBlock[];
}) {
  const taskTheme = getTaskTheme({
    taskName: block.task_type_name,
    taskColor: block.task_type_color,
  });
  const statusTheme = getStatusTheme(block.block_status);
  const sequence = getBlockSequenceInfo(block, allBlocks);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
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
        <span>{formatHours(block.block_duration_minutes)} heute</span>
        {sequence.isMultiBlockOrder ? (
          <>
            <span className="text-slate-300">•</span>
            <span>{formatHours(sequence.totalOrderMinutes)} gesamt</span>
          </>
        ) : null}
      </div>

      {sequence.isMultiBlockOrder ? (
        <div className="flex flex-wrap items-center gap-2">
          <ContinuationBadge
            label={`Teil ${sequence.currentBlockIndex}/${sequence.totalOrderBlocks}`}
          />

          {sequence.hasPreviousBlock && sequence.previousBlockDate ? (
            <ContinuationBadge
              label={`Fortsetzung von ${formatDateLabel(sequence.previousBlockDate)}`}
            />
          ) : null}

          {sequence.hasNextBlock && sequence.nextBlockDate ? (
            <ContinuationBadge
              label={`Weiter am ${formatDateLabel(sequence.nextBlockDate)}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BlockCardContent({
  block,
  allBlocks,
}: {
  block: CalendarBlock;
  allBlocks: CalendarBlock[];
}) {
  const sequence = getBlockSequenceInfo(block, allBlocks);

  return (
    <div className="flex h-full flex-col pl-2">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-5 text-slate-900">
            {block.title}
          </div>
          <div className="truncate text-xs text-slate-500">{block.customer_name}</div>
        </div>

        <div className="shrink-0 text-right text-[11px] font-medium text-slate-500">
          <div>
            {formatTime(block.block_start)}–{formatTime(block.block_end)}
          </div>
          {sequence.isMultiBlockOrder ? (
            <div className="mt-0.5 text-[10px] text-slate-400">mehrtägig</div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CleanMetaLine block={block} allBlocks={allBlocks} />
      </div>
    </div>
  );
}

function DraggableBlockCard({
  block,
  allBlocks,
  onOpen,
}: {
  block: CalendarBlock;
  allBlocks: CalendarBlock[];
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
      className={`absolute left-2 right-2 h-full cursor-grab overflow-hidden rounded-[22px] border bg-white p-3 shadow-sm active:cursor-grabbing ${
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

      <div className="pointer-events-none relative z-10 h-full">
        <BlockCardContent block={block} allBlocks={allBlocks} />
      </div>
    </div>
  );
}

function DragPreviewCard({
  block,
  allBlocks,
}: {
  block: CalendarBlock;
  allBlocks: CalendarBlock[];
}) {
  const employeeTheme = getEmployeeTheme({
    userId: block.user_id,
    userName: block.user_name,
  });

  return (
    <div className="relative w-[320px] overflow-hidden rounded-[22px] border bg-white p-3 shadow-xl">
      <div
        className="absolute bottom-0 left-0 top-0 w-1.5"
        style={{ backgroundColor: employeeTheme.solid }}
      />
      <div className="relative">
        <BlockCardContent block={block} allBlocks={allBlocks} />
      </div>
    </div>
  );
}

function DropCell({ id, top }: { id: string; top: number }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 right-0 transition-colors ${
        isOver ? "bg-sky-50/70" : ""
      }`}
      style={{
        top: `${top}px`,
        height: `${SLOT_MINUTES * PIXELS_PER_MINUTE}px`,
      }}
    />
  );
}

function parseDropCellId(value: string) {
  const match =
    /^cell-(\d+)-(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  return {
    userId: Number(match[1]),
    targetDate: match[2],
    hour: Number(match[3]),
    minute: Number(match[4]),
  };
}

function MobileBlockCard({
  block,
  allBlocks,
  onOpen,
}: {
  block: CalendarBlock;
  allBlocks: CalendarBlock[];
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

      <CleanMetaLine block={block} allBlocks={allBlocks} />
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

  const slots = useMemo(
    () =>
      Array.from({ length: TOTAL_SLOTS }, (_, index) => {
        const minutesFromStart = index * SLOT_MINUTES;
        const hour = START_HOUR + Math.floor(minutesFromStart / 60);
        const minute = minutesFromStart % 60;
        const top = minutesFromStart * PIXELS_PER_MINUTE;

        return {
          index,
          hour,
          minute,
          top,
          isHourLine: minute === 0,
        };
      }),
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
      `${parsed.targetDate} ${String(parsed.hour).padStart(2, "0")}:${String(
        parsed.minute
      ).padStart(2, "0")}:00`
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
            <p className="g98-section-subtitle">{dayjs(date).format("DD.MM.YYYY")}</p>
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
              Keine Einträge für{" "}
              {users.find((user) => user.id === activeUserId)?.name ?? "diese Person"}.
            </div>
          ) : (
            mobileBlocks.map((block) => (
              <MobileBlockCard
                key={block.schedule_block_id}
                block={block}
                allBlocks={blocks}
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
                    <div key={user.id} className="border-b border-r bg-white px-4 py-3">
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
                    <div key={user.id} className="relative border-r bg-white">
                      <div className="relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                        {slots.map((slot) => (
                          <DropCell
                            key={`drop-${user.id}-${slot.index}`}
                            id={`cell-${user.id}-${date}-${String(slot.hour).padStart(
                              2,
                              "0"
                            )}-${String(slot.minute).padStart(2, "0")}`}
                            top={slot.top}
                          />
                        ))}

                        {slots.map((slot) => (
                          <div
                            key={`line-${user.id}-${slot.index}`}
                            className={`absolute left-0 right-0 ${
                              slot.isHourLine
                                ? "border-t border-slate-100"
                                : "border-t border-slate-100/60"
                            }`}
                            style={{ top: `${slot.top}px` }}
                          />
                        ))}

                        {userBlocks.map((block) => (
                          <div
                            key={block.schedule_block_id}
                            className="absolute left-0 right-0"
                            style={getBlockStyle(block)}
                          >
                            <DraggableBlockCard
                              block={block}
                              allBlocks={blocks}
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
              {activeBlock ? (
                <DragPreviewCard block={activeBlock} allBlocks={blocks} />
              ) : null}
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