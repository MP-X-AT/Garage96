import dayjs from "@/lib/dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import Link from "next/link";

import { Topbar } from "@/components/app/topbar";
import { MonthViewClient } from "@/components/calendar/month-view-client";
import {
  getAllActiveUsers,
  getMonthCalendarBlocks,
  getCalendarExceptionsForMonth,
} from "@/lib/calendar";

dayjs.extend(isoWeek);

type PageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

export default async function MonatsansichtPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentMonth = params.month
    ? dayjs(params.month).startOf("month")
    : dayjs().startOf("month");

  const month = currentMonth.format("YYYY-MM-DD");
  const prevMonth = currentMonth.subtract(1, "month").format("YYYY-MM-DD");
  const nextMonth = currentMonth.add(1, "month").format("YYYY-MM-DD");
  const thisMonth = dayjs().startOf("month").format("YYYY-MM-DD");

  const [users, blocks, exceptions] = await Promise.all([
    getAllActiveUsers(),
    getMonthCalendarBlocks(month),
    getCalendarExceptionsForMonth(month),
  ]);

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Monat"
          subtitle={currentMonth.format("MMMM YYYY")}
          primaryAction={{
            href: `/tagesansicht?date=${dayjs().format("YYYY-MM-DD")}`,
            label: "Zu heute",
          }}
        />

        <section className="flex flex-wrap gap-2">
          <Link
            href={`/monatsansicht?month=${prevMonth}`}
            className="g98-action-secondary"
          >
            ← Voriger Monat
          </Link>

          <Link
            href={`/monatsansicht?month=${thisMonth}`}
            className="g98-action-secondary"
          >
            Dieser Monat
          </Link>

          <Link
            href={`/monatsansicht?month=${nextMonth}`}
            className="g98-action-secondary"
          >
            Nächster Monat →
          </Link>
        </section>

        <MonthViewClient
          month={month}
          users={users}
          blocks={blocks}
          exceptions={exceptions}
        />
      </div>
    </main>
  );
}