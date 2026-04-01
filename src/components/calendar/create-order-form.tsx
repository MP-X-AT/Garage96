"use client";

import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

type CreateOrderFormProps = {
  date: string;
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

function formatPreviewRange(start: string, end: string) {
  const startDate = dayjs(start);
  const endDate = dayjs(end);

  if (startDate.format("YYYY-MM-DD") === endDate.format("YYYY-MM-DD")) {
    return `${startDate.format("DD.MM.YYYY HH:mm")} – ${endDate.format("HH:mm")}`;
  }

  return `${startDate.format("DD.MM.YYYY HH:mm")} – ${endDate.format("DD.MM.YYYY HH:mm")}`;
}

export function CreateOrderForm({
  date,
  users,
  taskTypes,
}: CreateOrderFormProps) {
  const router = useRouter();

  const initialUserId = useMemo(() => String(users[0]?.id ?? ""), [users]);
  const initialTaskTypeId = useMemo(
    () => String(taskTypes[0]?.id ?? ""),
    [taskTypes]
  );

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [price, setPrice] = useState("");
  const [taskTypeId, setTaskTypeId] = useState(initialTaskTypeId);
  const [userId, setUserId] = useState(initialUserId);
  const [selectedDate, setSelectedDate] = useState(date);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [notes, setNotes] = useState("");

  const [suggestion, setSuggestion] = useState<SuggestionResponse | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = users.find((item) => String(item.id) === userId);
  const selectedTask = taskTypes.find((item) => String(item.id) === taskTypeId);

  const employeeTheme = getEmployeeTheme({
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

    if (!userId) {
      setError("Bitte zuerst eine Person auswählen.");
      return;
    }

    if (!selectedDate) {
      setError("Bitte ein Datum auswählen.");
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
          userId: Number(userId),
          durationMinutes,
          date: selectedDate,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Planungsvorschlag konnte nicht geladen werden."
        );
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
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          phone: customerPhone,
          title,
          vehicleInfo,
          price: price === "" ? null : Number(price),
          taskTypeId: Number(taskTypeId),
          userId: Number(userId),
          date: selectedDate,
          durationMinutes,
          notes,
          start: suggestion?.start ?? undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Auftrag konnte nicht angelegt werden.");
      }

      const newDate = selectedDate;

      setCustomerName("");
      setCustomerPhone("");
      setTitle("");
      setVehicleInfo("");
      setPrice("");
      setTaskTypeId(String(taskTypes[0]?.id ?? ""));
      setUserId(String(users[0]?.id ?? ""));
      setDurationMinutes(120);
      setNotes("");
      setSuggestion(null);
      setShowAdvanced(false);

      router.push(`/tagesansicht?date=${newDate}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="g98-panel overflow-hidden">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="g98-section-title">Schnellplaner</h2>
            <p className="g98-section-subtitle">
              Auftrag anlegen, Vorschlag holen, speichern.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="g98-action-secondary"
          >
            {showAdvanced ? "Einfache Ansicht" : "Mehr Felder"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div
            className="rounded-[26px] border p-4"
            style={{
              backgroundColor: employeeTheme.softAlt,
              borderColor: employeeTheme.border,
            }}
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Zuständig
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                style={{ backgroundColor: employeeTheme.solid }}
              >
                {(selectedUser?.name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold text-slate-900">
                  {selectedUser?.name || "Keine Person"}
                </div>
                <div className="text-sm text-slate-500">
                  Mitarbeiterfarbe = Orientierung
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-[26px] border p-4"
            style={{
              backgroundColor: taskTheme.softAlt,
              borderColor: taskTheme.border,
            }}
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Arbeitsart
            </div>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-2xl"
                style={{ backgroundColor: taskTheme.solid }}
              />
              <div>
                <div className="font-semibold text-slate-900">
                  {selectedTask?.name || "Keine Arbeitsart"}
                </div>
                <div className="text-sm text-slate-500">
                  Akzentfarbe = Kategorie
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Kund:in</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              placeholder="Max Mustermann"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Telefon</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              placeholder="0664 1234567"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Titel</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              placeholder="Innenreinigung"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Fahrzeug</label>
            <input
              value={vehicleInfo}
              onChange={(e) => setVehicleInfo(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              placeholder="BMW X3, schwarz"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Person</label>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setSuggestion(null);
              }}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
              required
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Arbeitsart</label>
            <select
              value={taskTypeId}
              onChange={(e) => {
                setTaskTypeId(e.target.value);
              }}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
              required
            >
              {taskTypes.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tag</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSuggestion(null);
              }}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Preis</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              placeholder="290"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-700">Dauer</div>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((option) => {
              const active = durationMinutes === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setDurationMinutes(option.value);
                    setSuggestion(null);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {showAdvanced ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Notiz</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[110px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                placeholder="Zusätzliche Infos"
              />
            </div>

            <div className="rounded-[26px] border bg-slate-50 p-4 text-sm text-slate-600">
              <div className="mb-2 font-semibold text-slate-800">
                Planungshinweis
              </div>
              <ul className="space-y-1">
                <li>• Arbeitszeiten werden automatisch berücksichtigt.</li>
                <li>• Lange Aufträge werden auf mehrere Tage aufgeteilt.</li>
                <li>• Der Vorschlag orientiert sich an freien Slots.</li>
              </ul>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadSuggestion}
            disabled={loadingSuggestion}
            className="g98-action-secondary"
          >
            {loadingSuggestion ? "Berechne Vorschlag ..." : "Vorschlag laden"}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="g98-action-primary"
          >
            {saving ? "Speichert ..." : "Auftrag anlegen"}
          </button>
        </div>

        {suggestion ? (
          <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-sky-900">
                  Planungsvorschlag
                </div>
                <div className="text-sm text-sky-700">
                  {selectedUser?.name ?? "Ausgewählte Person"}
                </div>
              </div>

              <div className="text-sm font-medium text-sky-800">
                Start: {dayjs(suggestion.start).format("DD.MM.YYYY HH:mm")}
              </div>
            </div>

            <div className="space-y-2">
              {suggestion.blocks.map((block, index) => (
                <div
                  key={`${block.start}-${index}`}
                  className="rounded-2xl border border-sky-100 bg-white px-4 py-3"
                >
                  <div className="text-sm font-medium text-slate-900">
                    {formatPreviewRange(block.start, block.end)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {Math.round((block.durationMinutes / 60) * 100) / 100} h
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Mit <span className="font-medium">„Vorschlag laden“</span> siehst du
            sofort, wann der Auftrag eingeplant wird.
          </div>
        )}
      </form>
    </section>
  );
}