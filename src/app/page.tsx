import dayjs from "@/lib/dayjs";

import { Topbar } from "@/components/app/topbar";
import { StartPlanner } from "@/components/app/start-planner";
import { getAllActiveUsers, getTaskTypes } from "@/lib/calendar";

export default async function HomePage() {
  const today = dayjs().format("YYYY-MM-DD");

  const [users, taskTypes] = await Promise.all([
    getAllActiveUsers(),
    getTaskTypes(),
  ]);

  return (
    <main className="min-h-screen">
      <div className="g98-shell">
        <Topbar
          title="Start"
          subtitle="Direkt Termin eintragen – ohne langes Herumsuchen."
          primaryAction={{
            href: `/tagesansicht?date=${today}`,
            label: "Heute ansehen",
          }}
        />

        <StartPlanner users={users} taskTypes={taskTypes} />
      </div>
    </main>
  );
}