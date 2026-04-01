import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import Link from "next/link";

import { Topbar } from "@/components/app/topbar";
import { CreateOrderForm } from "@/components/calendar/create-order-form";
import { DayViewClient } from "@/components/calendar/day-view-client";
import {
  getAllActiveUsers,
  getCalendarExceptionsForDay,
  getDayCalendarBlocks,
  getTaskTypes,
} from "@/lib/calendar";

dayjs.extend(isoWeek);

type PageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function TagesansichtPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const date = params.date ?? dayjs().format("YYYY-MM-DD");

  const [blocks, users, taskTypes, exceptions] = await Promise.all([
    getDayCalendarBlocks(date),
    getAllActiveUsers(),
    getTaskTypes(),
    getCalendarExceptionsForDay(date),
  ]);

  const currentDate = dayjs(date);
  const prevDate = currentDate.subtract(1, "day").format("YYYY-MM-DD");
  const nextDate = currentDate.add(1, "day").format("YYYY-MM-DD");
  const today = dayjs().format("YYYY-MM-DD");

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Heute"
          subtitle={currentDate.format("dddd, DD.MM.YYYY")}
          primaryAction={{
            href: `/wochenansicht?week=${currentDate.startOf("isoWeek").format("YYYY-MM-DD")}`,
            label: "Zur Woche",
          }}
        />

        <section className="flex flex-wrap gap-2">
          <Link
            href={`/tagesansicht?date=${prevDate}`}
            className="g98-action-secondary"
          >
            ← Vortag
          </Link>

          <Link
            href={`/tagesansicht?date=${today}`}
            className="g98-action-secondary"
          >
            Heute
          </Link>

          <Link
            href={`/tagesansicht?date=${nextDate}`}
            className="g98-action-secondary"
          >
            Nächster Tag →
          </Link>
        </section>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <CreateOrderForm date={date} users={users} taskTypes={taskTypes} />
          </div>

          <DayViewClient
            date={date}
            users={users}
            taskTypes={taskTypes}
            blocks={blocks}
            exceptions={exceptions}
          />
        </div>
      </div>
    </main>
  );
}