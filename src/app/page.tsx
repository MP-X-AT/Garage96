import Link from "next/link";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

import { Topbar } from "@/components/app/topbar";
import {
  getAllActiveUsers,
  getDayCalendarBlocks,
  getTaskTypes,
  getWeekCalendarBlocks,
} from "@/lib/calendar";
import {
  formatHours,
  getEmployeeTheme,
  getStatusLabel,
  getStatusTheme,
  getTaskTheme,
} from "@/lib/ui-theme";
import type { CalendarBlock } from "@/types/calendar";

dayjs.extend(isoWeek);

function groupByUser<T extends { user_id: number }>(items: T[]) {
  const map = new Map<number, T[]>();

  for (const item of items) {
    if (!map.has(item.user_id)) {
      map.set(item.user_id, []);
    }

    map.get(item.user_id)!.push(item);
  }

  return map;
}

function getUpcomingBlocks(blocks: CalendarBlock[], now: dayjs.Dayjs) {
  const sorted = [...blocks].sort(
    (a, b) => dayjs(a.block_start).unix() - dayjs(b.block_start).unix()
  );

  const futureOrCurrent = sorted.filter((block) =>
    dayjs(block.block_end).isAfter(now)
  );

  return futureOrCurrent.length > 0 ? futureOrCurrent.slice(0, 6) : sorted.slice(0, 6);
}

function getHighestPriorityBlocks(blocks: CalendarBlock[]) {
  const weight = {
    dringend: 4,
    hoch: 3,
    normal: 2,
    niedrig: 1,
  } as const;

  return [...blocks]
    .sort((a, b) => {
      const aWeight =
        weight[(a.priority as keyof typeof weight) || "normal"] ?? 2;
      const bWeight =
        weight[(b.priority as keyof typeof weight) || "normal"] ?? 2;

      if (aWeight !== bWeight) return bWeight - aWeight;

      return dayjs(a.block_start).unix() - dayjs(b.block_start).unix();
    })
    .slice(0, 4);
}

export default async function HomePage() {
  const today = dayjs().format("YYYY-MM-DD");
  const week = dayjs().startOf("isoWeek").format("YYYY-MM-DD");
  const now = dayjs();

  const [users, taskTypes, todayBlocks, weekBlocks] = await Promise.all([
    getAllActiveUsers(),
    getTaskTypes(),
    getDayCalendarBlocks(today),
    getWeekCalendarBlocks(week),
  ]);

  const todayByUser = groupByUser(todayBlocks);
  const upcomingBlocks = getUpcomingBlocks(todayBlocks, now);
  const criticalWeekBlocks = getHighestPriorityBlocks(weekBlocks);

  const totalTodayMinutes = todayBlocks.reduce(
    (sum, block) => sum + block.block_duration_minutes,
    0
  );

  const activeTodayCount = todayBlocks.filter(
    (block) => block.block_status === "in_arbeit"
  ).length;

  const pausedTodayCount = todayBlocks.filter(
    (block) => block.block_status === "pausiert"
  ).length;

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Dashboard"
          subtitle={dayjs(today).format("dddd, DD.MM.YYYY")}
          primaryAction={{
            href: `/tagesansicht?date=${today}`,
            label: "Heute öffnen",
          }}
        />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="g98-kpi-card">
            <div className="text-sm font-medium text-slate-500">Heute geplant</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              {todayBlocks.length}
            </div>
            <div className="mt-2 text-sm text-slate-500">Blöcke im Tagesplan</div>
          </div>

          <div className="g98-kpi-card">
            <div className="text-sm font-medium text-slate-500">Arbeitszeit</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              {formatHours(totalTodayMinutes)}
            </div>
            <div className="mt-2 text-sm text-slate-500">über das ganze Team</div>
          </div>

          <div className="g98-kpi-card">
            <div className="text-sm font-medium text-slate-500">Aktiv / pausiert</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              {activeTodayCount} / {pausedTodayCount}
            </div>
            <div className="mt-2 text-sm text-slate-500">direkter Handlungsfokus</div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="g98-panel">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="g98-section-title">Team heute</h2>
                <p className="g98-section-subtitle">
                  klare Verantwortung, ruhige Übersicht
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {users.map((user) => {
                const theme = getEmployeeTheme({
                  userId: user.id,
                  userName: user.name,
                });
                const userBlocks = (todayByUser.get(user.id) ?? []).sort(
                  (a, b) =>
                    dayjs(a.block_start).unix() - dayjs(b.block_start).unix()
                );
                const totalMinutes = userBlocks.reduce(
                  (sum, block) => sum + block.block_duration_minutes,
                  0
                );
                const nextBlock = userBlocks.find((block) =>
                  dayjs(block.block_end).isAfter(now)
                );

                return (
                  <div
                    key={user.id}
                    className="rounded-[28px] border p-4"
                    style={{
                      backgroundColor: theme.softAlt,
                      borderColor: theme.border,
                    }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                        style={{ backgroundColor: theme.solid }}
                      >
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div>
                        <div className="font-semibold text-slate-900">
                          {user.name}
                        </div>
                        <div className="text-sm text-slate-500">
                          {userBlocks.length} Block{userBlocks.length === 1 ? "" : "e"}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-slate-500">Auslastung</span>
                          <span className="font-medium text-slate-700">
                            {formatHours(totalMinutes)} / 9 h
                          </span>
                        </div>

                        <div className="h-2.5 rounded-full bg-white/70">
                          <div
                            className="h-2.5 rounded-full"
                            style={{
                              width: `${Math.min((totalMinutes / 540) * 100, 100)}%`,
                              backgroundColor: theme.solid,
                            }}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/80 p-3">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Nächster Auftrag
                        </div>
                        {nextBlock ? (
                          <>
                            <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                              {nextBlock.title}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {dayjs(nextBlock.block_start).format("HH:mm")} ·{" "}
                              {nextBlock.customer_name}
                            </div>
                          </>
                        ) : (
                          <div className="mt-2 text-sm text-slate-500">
                            Kein weiterer Auftrag heute
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="g98-panel">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="g98-section-title">Nächste Aufgaben</h2>
                <p className="g98-section-subtitle">das Wichtigste für jetzt</p>
              </div>

              <Link href={`/tagesansicht?date=${today}`} className="g98-action-secondary">
                Tagesplan
              </Link>
            </div>

            <div className="space-y-3">
              {upcomingBlocks.length === 0 ? (
                <div className="rounded-[24px] border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Keine geplanten Einträge für heute.
                </div>
              ) : (
                upcomingBlocks.map((block) => {
                  const employeeTheme = getEmployeeTheme({
                    userId: block.user_id,
                    userName: block.user_name,
                  });
                  const taskTheme = getTaskTheme({
                    taskName: block.task_type_name,
                    taskColor: block.task_type_color,
                  });
                  const statusTheme = getStatusTheme(block.block_status);

                  return (
                    <div
                      key={block.schedule_block_id}
                      className="rounded-[24px] border bg-white p-4"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {block.title}
                          </div>
                          <div className="mt-1 truncate text-sm text-slate-500">
                            {block.customer_name}
                          </div>
                        </div>

                        <div className="text-sm font-medium text-slate-700">
                          {dayjs(block.block_start).format("HH:mm")}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className="g98-chip"
                          style={{
                            backgroundColor: employeeTheme.soft,
                            borderColor: employeeTheme.border,
                            color: employeeTheme.text,
                          }}
                        >
                          {block.user_name}
                        </span>

                        <span
                          className="g98-chip"
                          style={{
                            backgroundColor: taskTheme.soft,
                            borderColor: taskTheme.border,
                            color: taskTheme.text,
                          }}
                        >
                          {block.task_type_name || "Keine Arbeitsart"}
                        </span>

                        <span
                          className="g98-chip"
                          style={{
                            backgroundColor: statusTheme.soft,
                            borderColor: statusTheme.border,
                            color: statusTheme.text,
                          }}
                        >
                          {getStatusLabel(block.block_status)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section className="g98-panel">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="g98-section-title">Wichtig diese Woche</h2>
              <p className="g98-section-subtitle">
                priorisierte Aufgaben, einfach und ruhig dargestellt
              </p>
            </div>

            <Link href={`/wochenansicht?week=${week}`} className="g98-action-secondary">
              Wochenansicht
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {criticalWeekBlocks.length === 0 ? (
              <div className="rounded-[24px] border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-4">
                Keine priorisierten Aufgaben in dieser Woche.
              </div>
            ) : (
              criticalWeekBlocks.map((block) => {
                const employeeTheme = getEmployeeTheme({
                  userId: block.user_id,
                  userName: block.user_name,
                });

                return (
                  <div
                    key={block.schedule_block_id}
                    className="rounded-[24px] border p-4"
                    style={{
                      backgroundColor: employeeTheme.softAlt,
                      borderColor: employeeTheme.border,
                    }}
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {block.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {block.customer_name}
                    </div>
                    <div className="mt-3 text-xs font-medium text-slate-600">
                      {block.user_name} · {dayjs(block.block_start).format("dd, DD.MM. HH:mm")}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}