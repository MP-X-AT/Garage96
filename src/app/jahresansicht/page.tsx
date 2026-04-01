import dayjs from "dayjs";
import Link from "next/link";

import { Topbar } from "@/components/app/topbar";
import { YearViewClient } from "@/components/calendar/year-view-client";
import {
  getAllActiveUsers,
  getYearCalendarBlocks,
  getCalendarExceptionsForYear,
} from "@/lib/calendar";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
  }>;
};

export default async function JahresansichtPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const currentYear = params.year ? Number(params.year) : dayjs().year();

  const prevYear = currentYear - 1;
  const nextYear = currentYear + 1;
  const thisYear = dayjs().year();

  const [users, blocks, exceptions] = await Promise.all([
    getAllActiveUsers(),
    getYearCalendarBlocks(currentYear),
    getCalendarExceptionsForYear(currentYear),
  ]);

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Jahr"
          subtitle={String(currentYear)}
          primaryAction={{
            href: `/monatsansicht?month=${dayjs().startOf("month").format("YYYY-MM-DD")}`,
            label: "Zu diesem Monat",
          }}
        />

        <section className="flex flex-wrap gap-2">
          <Link
            href={`/jahresansicht?year=${prevYear}`}
            className="g98-action-secondary"
          >
            ← Voriges Jahr
          </Link>

          <Link
            href={`/jahresansicht?year=${thisYear}`}
            className="g98-action-secondary"
          >
            Dieses Jahr
          </Link>

          <Link
            href={`/jahresansicht?year=${nextYear}`}
            className="g98-action-secondary"
          >
            Nächstes Jahr →
          </Link>
        </section>

        <YearViewClient
          year={currentYear}
          users={users}
          blocks={blocks}
          exceptions={exceptions}
        />
      </div>
    </main>
  );
}