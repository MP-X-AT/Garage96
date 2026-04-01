"use client";

import { useMemo, useState } from "react";
import dayjs from "@/lib/dayjs";

type UserOption = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
};

type ConflictItem = {
  start: string;
  end: string;
  orderId?: number;
};

type Props = {
  users: UserOption[];
  taskTypes: TaskTypeOption[];
  onCreated?: () => void;
};

const DURATIONS = [
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

export default function QuickCreateOrderSheet({
  users,
  taskTypes,
  onCreated,
}: Props) {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [userId, setUserId] = useState<number | "">(users[0]?.id ?? "");
  const [taskTypeId, setTaskTypeId] = useState<number | "">(taskTypes[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("08:00");
  const [durationMinutes, setDurationMinutes] = useState<number>(120);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  function buildPayload(forceSave = false) {
    const selectedTask = taskTypes.find((type) => type.id === taskTypeId);
    return {
      customerName: customerName.trim(),
      phone: phone.trim(),
      title: title.trim() || selectedTask?.name || "Auftrag",
      vehicleInfo: vehicleInfo.trim(),
      notes: notes.trim(),
      price: price ? Number(price) : null,
      userId,
      taskTypeId,
      durationMinutes,
      date,
      start: `${date} ${startTime}:00`,
      forceSave,
    };
  }

  async function submitPayload(payload: Record<string, unknown>) {
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      setCustomerName("");
      setPhone("");
      setTitle("");
      setVehicleInfo("");
      setNotes("");
      setPrice("");
      setUserId(users[0]?.id ?? "");
      setTaskTypeId(taskTypes[0]?.id ?? "");
      setDate(today);
      setStartTime("08:00");
      setDurationMinutes(120);
      setWarning("");
      setConflicts([]);
      setPendingPayload(null);
      onCreated?.();
      return;
    }

    if (data?.requiresConfirmation) {
      setWarning(data.warning || "Es gibt einen Planungskonflikt.");
      setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
      setPendingPayload(payload);
      return;
    }

    throw new Error(data?.error || "Auftrag konnte nicht erstellt werden.");
  }

  async function createOrder() {
    setError("");
    setWarning("");
    setConflicts([]);
    setPendingPayload(null);

    if (!customerName.trim()) {
      setError("Bitte Kund:in angeben.");
      return;
    }

    if (!userId) {
      setError("Bitte Mitarbeiter:in auswählen.");
      return;
    }

    if (!taskTypeId) {
      setError("Bitte Arbeitsart auswählen.");
      return;
    }

    setSaving(true);

    try {
      await submitPayload(buildPayload(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCreateDespiteConflict() {
    if (!pendingPayload) return;

    setSaving(true);
    setError("");

    try {
      await submitPayload({ ...pendingPayload, forceSave: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Schnellplaner</h2>
        <p className="text-sm text-neutral-500">
          Manuell planen, Konflikte prüfen, bei Bedarf trotzdem speichern.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-xl border px-3 py-3"
          placeholder="Kund:in"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />

        <input
          className="rounded-xl border px-3 py-3"
          placeholder="Telefon"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          className="rounded-xl border px-3 py-3"
          placeholder="Titel (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          className="rounded-xl border px-3 py-3"
          placeholder="Fahrzeuginfo"
          value={vehicleInfo}
          onChange={(e) => setVehicleInfo(e.target.value)}
        />

        <select
          className="rounded-xl border px-3 py-3"
          value={userId}
          onChange={(e) =>
            setUserId(e.target.value ? Number(e.target.value) : "")
          }
        >
          <option value="">Mitarbeiter:in wählen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border px-3 py-3"
          value={taskTypeId}
          onChange={(e) =>
            setTaskTypeId(e.target.value ? Number(e.target.value) : "")
          }
        >
          <option value="">Arbeitsart wählen</option>
          {taskTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <input
          className="rounded-xl border px-3 py-3"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <input
          className="rounded-xl border px-3 py-3"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <input
          className="rounded-xl border px-3 py-3 md:col-span-2"
          type="number"
          min="0"
          step="0.01"
          placeholder="Preis"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Dauer</div>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((item) => {
            const active = durationMinutes === item.value;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setDurationMinutes(item.value)}
                className={`rounded-full border px-4 py-2 text-sm ${
                  active ? "border-black bg-black text-white" : "bg-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        className="min-h-[100px] w-full rounded-xl border px-3 py-3"
        placeholder="Notizen"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={createOrder}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
        >
          {saving ? "Speichert..." : "Auftrag anlegen"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
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

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={confirmCreateDespiteConflict}
              disabled={saving}
              className="rounded-xl bg-amber-600 px-4 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Speichert..." : "Trotzdem speichern"}
            </button>

            <button
              type="button"
              onClick={() => {
                setWarning("");
                setConflicts([]);
                setPendingPayload(null);
              }}
              className="rounded-xl border bg-white px-4 py-3 text-slate-700"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}