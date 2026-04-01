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
  const [userId, setUserId] = useState<number | "">("");
  const [taskTypeId, setTaskTypeId] = useState<number | "">("");
  const [date, setDate] = useState(today);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionResponse | null>(null);

  async function loadSuggestion() {
    setError("");
    setSuggestion(null);

    if (!userId) {
      setError("Bitte Mitarbeiter:in auswählen.");
      return;
    }

    setLoadingSuggestion(true);

    try {
      const res = await fetch("/api/schedule/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, durationMinutes, date }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Planungsvorschlag konnte nicht geladen werden."
        );
      }

      setSuggestion(data.suggestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function createOrder() {
    setError("");

    if (!customerName.trim()) {
      setError("Bitte Kund:in angeben.");
      return;
    }

    if (!title.trim()) {
      setError("Bitte Titel angeben.");
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

    if (!suggestion) {
      setError("Bitte zuerst einen Planungsvorschlag laden.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          phone,
          title,
          vehicleInfo,
          notes,
          price: price ? Number(price) : null,
          userId,
          taskTypeId,
          durationMinutes,
          date,
          start: suggestion.start,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Auftrag konnte nicht erstellt werden.");
      }

      setCustomerName("");
      setPhone("");
      setTitle("");
      setVehicleInfo("");
      setNotes("");
      setPrice("");
      setUserId("");
      setTaskTypeId("");
      setDate(today);
      setDurationMinutes(120);
      setSuggestion(null);

      onCreated?.();
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
          Person wählen, Datum wählen, Vorschlag holen, speichern.
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
          placeholder="Titel"
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
          onClick={loadSuggestion}
          disabled={loadingSuggestion}
          className="rounded-xl bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
        >
          {loadingSuggestion ? "Berechne..." : "Vorschlag laden"}
        </button>

        <button
          type="button"
          onClick={createOrder}
          disabled={saving || !suggestion}
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

      {suggestion ? (
        <div className="rounded-2xl border bg-neutral-50 p-4">
          <div className="mb-2 font-medium">Planungsvorschlag</div>

          <div className="space-y-2 text-sm">
            {suggestion.blocks.map((block, index) => (
              <div
                key={`${block.start}-${index}`}
                className="rounded-xl border bg-white px-3 py-2"
              >
                <div>
                  {dayjs(block.start).format("DD.MM.YYYY HH:mm")} –{" "}
                  {dayjs(block.end).format("HH:mm")}
                </div>
                <div className="text-neutral-500">
                  {Math.round((block.durationMinutes / 60) * 100) / 100}h
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}