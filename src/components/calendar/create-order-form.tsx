"use client";

import dayjs from "@/lib/dayjs";
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

type ConflictItem = {
  start: string;
  end: string;
  orderId?: number;
};

type PendingPayload = {
  customerName: string;
  phone: string;
  title: string;
  vehicleInfo: string;
  price: number | null;
  taskTypeId: number;
  userId: number;
  date: string;
  start: string;
  durationMinutes: number;
  notes: string;
  forceSave?: boolean;
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

function formatConflictRange(start: string, end: string) {
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
  const [startTime, setStartTime] = useState("08:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [pendingPayload, setPendingPayload] = useState<PendingPayload | null>(null);

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

  function buildPayload(forceSave = false): PendingPayload {
    const effectiveTitle = title.trim() || selectedTask?.name || "Auftrag";

    return {
      customerName: customerName.trim(),
      phone: customerPhone.trim(),
      title: effectiveTitle,
      vehicleInfo: vehicleInfo.trim(),
      price: price === "" ? null : Number(price),
      taskTypeId: Number(taskTypeId),
      userId: Number(userId),
      date: selectedDate,
      start: `${selectedDate} ${startTime}:00`,
      durationMinutes,
      notes: notes.trim(),
      forceSave,
    };
  }

  async function submitPayload(payload: PendingPayload) {
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      const newDate = payload.date;

      setCustomerName("");
      setCustomerPhone("");
      setTitle("");
      setVehicleInfo("");
      setPrice("");
      setTaskTypeId(String(taskTypes[0]?.id ?? ""));
      setUserId(String(users[0]?.id ?? ""));
      setSelectedDate(date);
      setStartTime("08:00");
      setDurationMinutes(120);
      setNotes("");
      setShowAdvanced(false);
      setWarning(null);
      setConflicts([]);
      setPendingPayload(null);

      router.push(`/tagesansicht?date=${newDate}`);
      router.refresh();
      return;
    }

    if (result?.requiresConfirmation) {
      setWarning(result.warning || "Es gibt einen Planungskonflikt.");
      setConflicts(Array.isArray(result.conflicts) ? result.conflicts : []);
      setPendingPayload(payload);
      return;
    }

    throw new Error(result?.error || "Auftrag konnte nicht angelegt werden.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarning(null);
    setConflicts([]);
    setPendingPayload(null);

    try {
      const payload = buildPayload(false);

      if (!payload.customerName) {
        throw new Error("Bitte Kund:in angeben.");
      }

      if (!payload.userId) {
        throw new Error("Bitte Mitarbeiter:in auswählen.");
      }

      if (!payload.taskTypeId) {
        throw new Error("Bitte Arbeitsart auswählen.");
      }

      await submitPayload(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmSaveDespiteConflict() {
    if (!pendingPayload) return;

    setSaving(true);
    setError(null);

    try {
      await submitPayload({ ...pendingPayload, forceSave: true });
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
              Startzeit manuell setzen, Konflikte prüfen, bei Bedarf trotzdem speichern.
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
                  Manuelle Planung, nur Warnung bei Konflikten
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
                  Titel wird automatisch gesetzt, wenn leer
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

      {warning ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <div className="font-semibold">{warning}</div>

          {conflicts.length > 0 ? (
            <div className="mt-3 space-y-2">
              {conflicts.map((conflict, index) => (
                <div
                  key={`${conflict.start}-${conflict.end}-${index}`}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2"
                >
                  {formatConflictRange(conflict.start, conflict.end)}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={confirmSaveDespiteConflict}
              disabled={saving}
              className="g98-action-primary"
            >
              {saving ? "Speichert ..." : "Trotzdem speichern"}
            </button>

            <button
              type="button"
              onClick={() => {
                setWarning(null);
                setConflicts([]);
                setPendingPayload(null);
              }}
              className="g98-action-secondary"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Kund:in *</label>
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
              placeholder={selectedTask?.name || "wird aus Arbeitsart übernommen"}
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Person *</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
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
            <label className="text-sm font-medium text-slate-700">Arbeitsart *</label>
            <select
              value={taskTypeId}
              onChange={(e) => setTaskTypeId(e.target.value)}
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
            <label className="text-sm font-medium text-slate-700">Tag *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Startzeit *</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
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
                  onClick={() => setDurationMinutes(option.value)}
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
                Hinweis
              </div>
              <ul className="space-y-1">
                <li>• Es wird nichts automatisch verschoben.</li>
                <li>• Startzeit wird manuell gesetzt.</li>
                <li>• Konflikte werden nur als Warnung angezeigt.</li>
                <li>• Längere Aufträge werden weiter nach Arbeitszeiten aufgeteilt.</li>
              </ul>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={saving}
            className="g98-action-primary"
          >
            {saving ? "Speichert ..." : "Auftrag anlegen"}
          </button>
        </div>
      </form>
    </section>
  );
}