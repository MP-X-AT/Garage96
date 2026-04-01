import dayjs from "dayjs";

import { Topbar } from "@/components/app/topbar";
import { StartPlanner } from "@/components/app/start-planner";
import { getAllActiveUsers, getDayCalendarBlocks, getTaskTypes } from "@/lib/calendar";
import { formatHours, getEmployeeTheme } from "@/lib/ui-theme";

export default async function HomePage() {
  const today = dayjs().format("YYYY-MM-DD");
  const [users, taskTypes, todayBlocks] = await Promise.all([
    getAllActiveUsers(),
    getTaskTypes(),
    getDayCalendarBlocks(today),
  ]);

  const blocksPerUser = users.map((user) => {
    const userBlocks = todayBlocks.filter((block) => block.user_id === user.id);
    const minutes = userBlocks.reduce((sum, block) => sum + block.block_duration_minutes, 0);
    return { user, count: userBlocks.length, minutes };
  });

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Start"
          subtitle="Direkt Termin eintragen – ohne langes Herumsuchen."
          primaryAction={{ href: `/tagesansicht?date=${today}`, label: "Heute ansehen" }}
        />

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Heute im Team</h2>
            <p className="mt-1 text-sm text-slate-500">Schneller Überblick, damit man sofort die richtige Person auswählt.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {blocksPerUser.map(({ user, count, minutes }) => {
                const theme = getEmployeeTheme({ userId: user.id, userName: user.name });
                return (
                  <div key={user.id} className="rounded-[24px] border p-4" style={{ backgroundColor: theme.softAlt, borderColor: theme.border }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white" style={{ backgroundColor: theme.solid }}>
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{user.name}</div>
                        <div className="text-sm text-slate-500">{count} Block{count === 1 ? "" : "e"}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-500">Heute geplant</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{formatHours(minutes)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[30px] border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Prinzip</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">1. Mitarbeiter:in antippen</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">2. Kund:in + Arbeitsart eintragen</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">3. Datum prüfen und speichern</div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">Dashboard bleibt separat für Auswertungen</div>
            </div>
          </div>
        </section>

        <StartPlanner users={users} taskTypes={taskTypes} />
      </div>
    </main>
  );
}
