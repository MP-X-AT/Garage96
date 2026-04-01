import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import Link from "next/link";

import { Topbar } from "@/components/app/topbar";
import { WeekViewClient } from "@/components/calendar/week-view-client";
import {
  getAllActiveUsers,
  getTaskTypes,
  getWeekCalendarBlocks,
  getCalendarExceptionsForWeek,
} from "@/lib/calendar";

dayjs.extend(isoWeek);

type PageProps = {
  searchParams?: Promise<{
    week?: string;
  }>;
};

export default async function WochenansichtPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentWeekStart = params.week
    ? dayjs(params.week).startOf("isoWeek")
    : dayjs().startOf("isoWeek");

  const weekStart = currentWeekStart.format("YYYY-MM-DD");
  const prevWeek = currentWeekStart.subtract(1, "week").format("YYYY-MM-DD");
  const nextWeek = currentWeekStart.add(1, "week").format("YYYY-MM-DD");
  const todayWeek = dayjs().startOf("isoWeek").format("YYYY-MM-DD");

  const [users, taskTypes, blocks, exceptions] = await Promise.all([
    getAllActiveUsers(),
    getTaskTypes(),
    getWeekCalendarBlocks(weekStart),
    getCalendarExceptionsForWeek(weekStart),
  ]);

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Woche"
          subtitle={`${currentWeekStart.format("DD.MM.YYYY")} – ${currentWeekStart
            .add(5, "day")
            .format("DD.MM.YYYY")}`}
          primaryAction={{
            href: `/tagesansicht?date=${dayjs().format("YYYY-MM-DD")}`,
            label: "Zu heute",
          }}
        />

        <section className="flex flex-wrap gap-2">
          <Link
            href={`/wochenansicht?week=${prevWeek}`}
            className="g98-action-secondary"
          >
            ← Vorige Woche
          </Link>

          <Link
            href={`/wochenansicht?week=${todayWeek}`}
            className="g98-action-secondary"
          >
            Diese Woche
          </Link>

          <Link
            href={`/wochenansicht?week=${nextWeek}`}
            className="g98-action-secondary"
          >
            Nächste Woche →
          </Link>
        </section>

        <WeekViewClient
          weekStart={weekStart}
          users={users}
          taskTypes={taskTypes}
          blocks={blocks}
          exceptions={exceptions}
        />
      </div>
    </main>
  );
}