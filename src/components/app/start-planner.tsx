"use client";

import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeTheme, getTaskTheme } from "@/lib/ui-theme";

type UserOption = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

type SuggestionBlock = {
  start: string;
  end: string;
  durationMinutes: number;
};

type SuggestionResponse = {
  start: string;
  end: string;
  blocks: SuggestionBlock[];
};

type StartPlannerProps = {
  users: UserOption[];
  taskTypes: TaskTypeOption[];
};

const DURATION_OPTIONS = [
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "3h", value: 180 },
  { label: "4h", value: 240 },
  { label: "6h", value: 360 },
  { label: "8h", value: 480 },
  { label: "10h", value: 600 },
  { label: "15h", value: 900 },
];

function formatSuggestionRange(start: string, end: string) {
  const startDate = dayjs(start);
  const endDate = dayjs(end);

  if (startDate.format("YYYY-MM-DD") === endDate.format("YYYY-MM-DD")) {
    return `${startDate.format("DD.MM.YYYY HH:mm")} – ${endDate.format("HH:mm")}`;
  }

  return `${startDate.format("DD.MM.YYYY HH:mm")} – ${endDate.format("DD.MM.YYYY HH:mm")}`;
}

export function StartPlanner({ users, taskTypes }: StartPlannerProps) {
  const router = useRouter();
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);

  const [selectedUserId, setSelectedUserId] = useState<number>(users[0]?.id ?? 0);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [taskTypeId, setTaskTypeId] = useState<number>(taskTypes[0]?.id ?? 0);
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notes, setNotes] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");

  const [suggestion, setSuggestion] = useState<SuggestionResponse | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedTask = taskTypes.find((task) => task.id === taskTypeId);

  const userTheme = getEmployeeTheme({
    userId: selectedUser?.id,
    userName: selectedUser?.name,
  });

  const taskTheme = getTaskTheme({
    taskName: selectedTask?.name,
    taskColor: selectedTask?.color,
  });

  async function loadSuggestion() {
    setError(null);
    setSuggestion(null);

    if (!selectedUserId) {
      setError("Bitte Mitarbeiter:in auswählen.");
      return;
    }

    if (!taskTypeId) {
      setError("Bitte Arbeitsart auswählen.");
      return;
    }

    if (!date) {
      setError("Bitte Datum auswählen.");
      return;
    }

    try {
      setLoadingSuggestion(true);

      const response = await fetch("/api/schedule/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUserId,
          durationMinutes,
          date,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Planungsvorschlag konnte nicht geladen werden.");
      }

      setSuggestion(result.suggestion);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Planungsvorschlag konnte nicht geladen werden."
      );
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError("Bitte Kund:in angeben.");
      return;
    }

    if (!taskTypeId) {
      setError("Bitte Arbeitsart auswählen.");
      return;
    }

    if (!selectedUserId) {
      setError("Bitte Mitarbeiter:in auswählen.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          phone,
          taskTypeId,
          userId: selectedUserId,
          price: price === "" ? null : Number(price),
          date,
          durationMinutes,
          notes,
          vehicleInfo,
          start: suggestion?.start ?? undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Termin konnte nicht angelegt werden.");
      }

      setCustomerName("");
      setPhone("");
      setPrice("");
      setDate(today);
      setDurationMinutes(120);
      setNotes("");
      setVehicleInfo("");
      setShowAdvanced(false);
      setSuggestion(null);

      router.push(`/tagesansicht?date=${date}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="g98-panel overflow-hidden">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="g98-section-title">Schnell Termin eintragen</h2>
            <p className="g98-section-subtitle">
              Person antippen, Pflichtfelder ausfüllen, speichern.
            </p>
          </div>

          <div className="rounded-[24px] border bg-slate-50 p-2">
            <div className="flex flex-wrap gap-2">
              {users.map((user) => {
                const active = user.id === selectedUserId;
                const theme = getEmployeeTheme({ userId: user.id, userName: user.name });

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active ? "text-white shadow-sm" : "bg-white text-slate-700"
                    }`}
                    style={
                      active
                        ? { backgroundColor: theme.solid, borderColor: theme.solid }
                        : { borderColor: theme.border }
                    }
                  >
                    <div className="text-sm font-semibold">{user.name}</div>
                    <div className={`text-xs ${active ? "text-white/80" : "text-slate-500"}`}>
                      Termin für {user.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Name Kund:in *</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                  placeholder="z. B. Autohaus Süd"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Telefonnummer</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                  placeholder="optional"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Preis</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="optional"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Arbeitsart *</span>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                  value={taskTypeId}
                  onChange={(e) => setTaskTypeId(Number(e.target.value))}
                  required
                >
                  {taskTypes.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Datum</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Dauer</span>
                <span className="text-xs font-medium text-slate-500">
                  {Math.round((durationMinutes / 60) * 100) / 100} h
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((option) => {
                  const active = option.value === durationMinutes;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDurationMinutes(option.value)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="text-sm font-medium text-slate-700"
              >
                {showAdvanced ? "Erweiterte Felder ausblenden" : "Erweiterte Felder anzeigen"}
              </button>

              {showAdvanced ? (
                <div className="mt-3 grid gap-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Fahrzeuginfo</span>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                      placeholder="optional"
                      value={vehicleInfo}
                      onChange={(e) => setVehicleInfo(e.target.value)}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">Notizen</span>
                    <textarea
                      className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-400"
                      placeholder="optional"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-4">
            <div
              className="rounded-[28px] border p-5"
              style={{ backgroundColor: userTheme.softAlt, borderColor: userTheme.border }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                  style={{ backgroundColor: userTheme.solid }}
                >
                  {(selectedUser?.name || "?").slice(0, 2).toUpperCase()}
                </div>

                <div>
                  <div className="text-sm text-slate-500">Aktive Person</div>
                  <div className="text-lg font-semibold text-slate-900">{selectedUser?.name}</div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white/85 p-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Arbeitsart</div>
                <div className="text-base font-semibold" style={{ color: taskTheme.text }}>
                  {selectedTask?.name || "Bitte wählen"}
                </div>
                <div className="mt-2 text-sm text-slate-500">{dayjs(date).format("dddd, DD.MM.YYYY")}</div>
              </div>
            </div>

            <div className="rounded-[28px] border bg-white p-5 shadow-sm">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">Zeitvorschlag</h3>
                <p className="text-sm text-slate-500">Vorschlag laden und dann direkt speichern.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                <button
                  type="button"
                  onClick={loadSuggestion}
                  disabled={loadingSuggestion}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {loadingSuggestion ? "Berechne..." : "Zeitvorschlag holen"}
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: userTheme.solid }}
                >
                  {saving ? "Speichert..." : "Termin speichern"}
                </button>
              </div>

              {suggestion ? (
                <div className="mt-4 space-y-2">
                  {suggestion.blocks.map((block, index) => (
                    <div
                      key={`${block.start}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="text-sm font-medium text-slate-900">
                        {formatSuggestionRange(block.start, block.end)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {Math.round((block.durationMinutes / 60) * 100) / 100} h
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Noch kein Vorschlag geladen. Ohne Vorschlag wird automatisch der nächste freie Slot verwendet.
                </div>
              )}

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </aside>
        </form>
      </section>
    </div>
  );
}
