import dayjs from "@/lib/dayjs";
import type { CalendarBlock } from "@/types/calendar";

type UserColumn = {
  id: number;
  name: string;
};

type DayViewProps = {
  date: string;
  users: UserColumn[];
  blocks: CalendarBlock[];
};

const START_HOUR = 8;
const END_HOUR = 17;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
const PIXELS_PER_MINUTE = 1.2;
const CALENDAR_HEIGHT = TOTAL_MINUTES * PIXELS_PER_MINUTE;

function formatTime(value: string) {
  return dayjs(value).format("HH:mm");
}

function getMinutesFromCalendarStart(value: string) {
  const d = dayjs(value);
  return (d.hour() - START_HOUR) * 60 + d.minute();
}

function getBlockStyle(block: CalendarBlock) {
  const top = getMinutesFromCalendarStart(block.block_start) * PIXELS_PER_MINUTE;
  const height = Math.max(block.block_duration_minutes * PIXELS_PER_MINUTE, 36);

  return {
    top: `${top}px`,
    height: `${height}px`,
  };
}

function getStatusClass(status: CalendarBlock["block_status"]) {
  switch (status) {
    case "in_arbeit":
      return "border-emerald-300 bg-emerald-50";
    case "pausiert":
      return "border-amber-300 bg-amber-50";
    case "erledigt":
      return "border-slate-300 bg-slate-100";
    default:
      return "border-sky-300 bg-sky-50";
  }
}

function getTaskColor(block: CalendarBlock) {
  return block.task_type_color || "#cbd5e1";
}

export function DayView({ date, users, blocks }: DayViewProps) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const usersToRender =
    users.length > 0
      ? users
      : [
          { id: 1, name: "Michi" },
          { id: 2, name: "Sandra" },
          { id: 3, name: "Erwin" },
        ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold">Tagesansicht</h2>
          <p className="text-sm text-slate-500">
            {dayjs(date).format("DD.MM.YYYY")}
          </p>
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid min-w-[1000px]"
            style={{ gridTemplateColumns: `90px repeat(${usersToRender.length}, minmax(280px, 1fr))` }}
          >
            <div className="border-r border-b bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
              Zeit
            </div>

            {usersToRender.map((user) => (
              <div
                key={user.id}
                className="border-b border-r bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                {user.name}
              </div>
            ))}

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

            {usersToRender.map((user) => {
              const userBlocks = blocks.filter((block) => block.user_id === user.id);

              return (
                <div key={user.id} className="relative border-r bg-white">
                  <div className="relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                    {hours.map((hour, index) => {
                      const top = index * 60 * PIXELS_PER_MINUTE;
                      return (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-t border-slate-100"
                          style={{ top: `${top}px` }}
                        />
                      );
                    })}

                    {userBlocks.map((block) => (
                      <div
                        key={block.schedule_block_id}
                        className={`absolute left-2 right-2 overflow-hidden rounded-2xl border p-3 shadow-sm ${getStatusClass(
                          block.block_status
                        )}`}
                        style={{
                          ...getBlockStyle(block),
                          borderLeftWidth: "6px",
                          borderLeftColor: getTaskColor(block),
                        }}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {block.title}
                            </div>
                            <div className="truncate text-xs text-slate-600">
                              {block.customer_name}
                            </div>
                          </div>
                          <div className="shrink-0 text-[11px] font-medium text-slate-500">
                            {formatTime(block.block_start)}–{formatTime(block.block_end)}
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-slate-600">
                          <div>{block.task_type_name ?? "Keine Arbeitsart"}</div>
                          {block.customer_phone ? <div>{block.customer_phone}</div> : null}
                          <div>
                            {block.price ?? 0} {block.currency}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {usersToRender.map((user) => {
          const userBlocks = blocks.filter((block) => block.user_id === user.id);

          return (
            <div key={user.id} className="rounded-3xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold">{user.name}</h3>

              {userBlocks.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Einträge.</p>
              ) : (
                <div className="space-y-3">
                  {userBlocks.map((block) => (
                    <div
                      key={block.schedule_block_id}
                      className={`rounded-2xl border p-3 ${getStatusClass(block.block_status)}`}
                      style={{ borderLeftWidth: "6px", borderLeftColor: getTaskColor(block) }}
                    >
                      <div className="font-semibold">{block.title}</div>
                      <div className="text-sm text-slate-600">{block.customer_name}</div>
                      <div className="text-sm text-slate-500">
                        {formatTime(block.block_start)}–{formatTime(block.block_end)}
                      </div>
                      <div className="text-sm text-slate-500">
                        {block.task_type_name ?? "Keine Arbeitsart"} · {block.price ?? 0}{" "}
                        {block.currency}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}