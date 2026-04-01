"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { formatHours, getEmployeeTheme } from "@/lib/ui-theme";
import type { CalendarBlock } from "@/types/calendar";
import type { CalendarException } from "@/lib/calendar";

type UserColumn = {
  id: number;
  name: string;
};

type YearViewClientProps = {
  year: number;
  users: UserColumn[];
  blocks: CalendarBlock[];
  exceptions: CalendarException[];
};

type MonthSummary = {
  key: string;
  date: dayjs.Dayjs;
  blocks: CalendarBlock[];
  exceptions: CalendarException[];
  totalMinutes: number;
  urgentCount: number;
  blockedDays: number;
  infoDays: number;
  userLoad: {
    userId: number;
    userName: string;
    totalMinutes: number;
  }[];
};

const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function buildYearSummary(
  year: number,
  users: UserColumn[],
  blocks: CalendarBlock[],
  exceptions: CalendarException[]
): MonthSummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = dayjs(`${year}-${String(index + 1).padStart(2, "0")}-01`);
    const key = date.format("YYYY-MM");

    const monthBlocks = blocks.filter(
      (block) => dayjs(block.block_start).format("YYYY-MM") === key
    );

    const monthExceptions = exceptions.filter(
      (item) => dayjs(item.exception_date).format("YYYY-MM") === key
    );

    const totalMinutes = monthBlocks.reduce(
      (sum, block) => sum + block.block_duration_minutes,
      0
    );

    const urgentCount = monthBlocks.filter(
      (block) => block.priority === "hoch" || block.priority === "dringend"
    ).length;

    const blockedDays = monthExceptions.filter(
      (item) => !(item.display_only === 1 || item.exception_type === "info")
    ).length;

    const infoDays = monthExceptions.filter(
      (item) => item.display_only === 1 || item.exception_type === "info"
    ).length;

    const userLoad = users.map((user) => {
      const totalMinutesPerUser = monthBlocks
        .filter((block) => block.user_id === user.id)
        .reduce((sum, block) => sum + block.block_duration_minutes, 0);

      return {
        userId: user.id,
        userName: user.name,
        totalMinutes: totalMinutesPerUser,
      };
    });

    return {
      key,
      date,
      blocks: monthBlocks,
      exceptions: monthExceptions,
      totalMinutes,
      urgentCount,
      blockedDays,
      infoDays,
      userLoad,
    };
  });
}

function getLoadBarClass(totalMinutes: number) {
  if (totalMinutes >= 120 * 60) return "bg-slate-900";
  if (totalMinutes >= 80 * 60) return "bg-slate-700";
  if (totalMinutes >= 40 * 60) return "bg-slate-500";
  if (totalMinutes >= 12 * 60) return "bg-slate-300";
  return "bg-slate-200";
}

function getRelativeLoadWidth(totalMinutes: number, maxMinutes: number) {
  if (maxMinutes <= 0) return 0;
  return Math.max(6, Math.round((totalMinutes / maxMinutes) * 100));
}

export function YearViewClient({
  year,
  users,
  blocks,
  exceptions,
}: YearViewClientProps) {
  const months = buildYearSummary(year, users, blocks, exceptions);

  const totalMinutes = months.reduce((sum, month) => sum + month.totalMinutes, 0);
  const totalBlocks = months.reduce((sum, month) => sum + month.blocks.length, 0);
  const totalUrgent = months.reduce((sum, month) => sum + month.urgentCount, 0);
  const totalBlockedDays = months.reduce(
    (sum, month) => sum + month.blockedDays,
    0
  );
  const totalInfoDays = months.reduce((sum, month) => sum + month.infoDays, 0);
  const maxMinutes = Math.max(...months.map((month) => month.totalMinutes), 0);

  return (
    <div className="space-y-4">
      <section className="g98-panel">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="g98-section-title">Jahresüberblick</h2>
            <p className="g98-section-subtitle">{year}</p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            <div className="rounded-2xl border bg-white px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Blöcke
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {totalBlocks}
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
                Wichtig
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {totalUrgent}
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
          {users.map((user) => {
            const theme = getEmployeeTheme({
              userId: user.id,
              userName: user.name,
            });

            const userMinutes = blocks
              .filter((block) => block.user_id === user.id)
              .reduce((sum, block) => sum + block.block_duration_minutes, 0);

            const userBlocks = blocks.filter((block) => block.user_id === user.id).length;

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
                      {userBlocks} Block{userBlocks === 1 ? "" : "e"}
                    </div>
                  </div>
                </div>

                <div className="text-xs font-medium text-slate-500">
                  {formatHours(userMinutes)} im Jahr
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {months.map((month, index) => (
          <Link
            key={month.key}
            href={`/monatsansicht?month=${month.date.format("YYYY-MM-DD")}`}
            className={`rounded-[28px] border bg-white p-5 shadow-sm transition hover:shadow-md ${
              month.blockedDays > 0
                ? "ring-1 ring-red-100"
                : month.infoDays > 0
                  ? "ring-1 ring-sky-100"
                  : ""
            }`}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {MONTH_LABELS[index]}
                </div>
                <div className="text-sm text-slate-500">
                  {month.blocks.length} Block{month.blocks.length === 1 ? "" : "e"}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                {month.blockedDays > 0 ? (
                  <div className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
                    {month.blockedDays} Feiertag{month.blockedDays === 1 ? "" : "e"}
                  </div>
                ) : null}

                {month.infoDays > 0 ? (
                  <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                    {month.infoDays} Info
                  </div>
                ) : null}

                {month.urgentCount > 0 ? (
                  <div className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    {month.urgentCount} wichtig
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">Monatslast</span>
                <span className="font-medium text-slate-700">
                  {formatHours(month.totalMinutes)}
                </span>
              </div>

              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full ${getLoadBarClass(month.totalMinutes)}`}
                  style={{
                    width: `${getRelativeLoadWidth(month.totalMinutes, maxMinutes)}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {month.userLoad.map((item) => {
                const theme = getEmployeeTheme({
                  userId: item.userId,
                  userName: item.userName,
                });

                return (
                  <div
                    key={`${month.key}-${item.userId}`}
                    className="flex items-center justify-between rounded-2xl border bg-slate-50 px-3 py-2"
                    style={{ borderColor: theme.border }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: theme.solid }}
                      />
                      <span className="truncate text-sm text-slate-700">
                        {item.userName}
                      </span>
                    </div>

                    <span className="shrink-0 text-xs font-medium text-slate-500">
                      {formatHours(item.totalMinutes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}