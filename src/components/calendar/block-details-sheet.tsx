"use client";

import dayjs from "@/lib/dayjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarBlock } from "@/types/calendar";
import {
  formatHours,
  getEmployeeTheme,
  getStatusLabel,
  getStatusTheme,
  getTaskTheme,
} from "@/lib/ui-theme";

type UserOption = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

type BlockDetailsSheetProps = {
  block: CalendarBlock | null;
  open: boolean;
  onClose: () => void;
  users: UserOption[];
  taskTypes: TaskTypeOption[];
};

const STATUS_OPTIONS = [
  { value: "geplant", label: "Geplant" },
  { value: "in_arbeit", label: "In Arbeit" },
  { value: "pausiert", label: "Pausiert" },
  { value: "erledigt", label: "Erledigt" },
] as const;

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

const START_HOUR_OPTIONS = Array.from({ length: 9 }, (_, index) => 8 + index);

function formatMoney(price: string | number | null, currency: string) {
  const numeric = typeof price === "string" ? Number(price) : price ?? 0;
  return `${Number.isNaN(numeric) ? 0 : numeric} ${currency}`;
}

function formatBlockRange(block: CalendarBlock) {
  const start = dayjs(block.block_start);
  const end = dayjs(block.block_end);

  if (start.format("YYYY-MM-DD") === end.format("YYYY-MM-DD")) {
    return `${start.format("DD.MM.YYYY HH:mm")} – ${end.format("HH:mm")}`;
  }

  return `${start.format("DD.MM.YYYY HH:mm")} – ${end.format(
    "DD.MM.YYYY HH:mm"
  )}`;
}

export function BlockDetailsSheet({
  block,
  open,
  onClose,
  users,
  taskTypes,
}: BlockDetailsSheetProps) {
  const router = useRouter();

  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  const [userId, setUserId] = useState("");
  const [taskTypeId, setTaskTypeId] = useState("");
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState("8");
  const [durationMinutes, setDurationMinutes] = useState(120);

  const selectedUser = users.find((user) => String(user.id) === userId);
  const selectedTaskType = taskTypes.find(
    (taskType) => String(taskType.id) === taskTypeId
  );

  const employeeTheme = getEmployeeTheme({
    userId: block?.user_id,
    userName: block?.user_name,
  });

  const taskTheme = getTaskTheme({
    taskName: block?.task_type_name,
    taskColor: block?.task_type_color,
  });

  const statusTheme = getStatusTheme(block?.block_status);

  const detailTitle = useMemo(() => {
    if (!block) return "";
    return block.title || "Auftrag";
  }, [block]);

  useEffect(() => {
    if (!block) return;

    setCustomerName(block.customer_name ?? "");
    setCustomerPhone(block.customer_phone ?? "");
    setTitle(block.title ?? "");
    setVehicleInfo(block.vehicle_info ?? "");
    setPrice(String(block.price ?? 0));
    setNotes(block.order_notes || block.block_notes || "");
    setUserId(String(block.user_id ?? ""));
    setTaskTypeId(String(block.task_type_id ?? ""));
    setDate(dayjs(block.block_start).format("YYYY-MM-DD"));
    setStartHour(String(dayjs(block.block_start).hour()));
    setDurationMinutes(
      block.order_estimated_duration_minutes ||
        block.block_duration_minutes ||
        120
    );
    setIsEditing(false);
    setError(null);
  }, [block]);

  if (!open || !block) return null;

  const currentBlock = block;

  async function updateStatus(status: string) {
    try {
      setSavingStatus(true);
      setError(null);

      const response = await fetch("/api/schedule-blocks/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scheduleBlockId: currentBlock.schedule_block_id,
          status,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Status konnte nicht gespeichert werden.");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveEdit() {
    try {
      setSavingEdit(true);
      setError(null);

      const response = await fetch("/api/orders/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: currentBlock.order_id,
          customerName,
          phone: customerPhone,
          title,
          vehicleInfo,
          price: price === "" ? null : Number(price),
          notes,
          userId: Number(userId),
          taskTypeId: Number(taskTypeId),
          date,
          startHour: Number(startHour),
          durationMinutes,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Auftrag konnte nicht gespeichert werden.");
      }

      setIsEditing(false);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteOrder() {
    const confirmed = window.confirm(
      `Auftrag "${currentBlock.title}" wirklich löschen?`
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch("/api/orders/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: currentBlock.order_id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Auftrag konnte nicht gelöscht werden.");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen.");
    } finally {
      setDeleting(false);
    }
  }

  function resetToBlock() {
    setCustomerName(currentBlock.customer_name ?? "");
    setCustomerPhone(currentBlock.customer_phone ?? "");
    setTitle(currentBlock.title ?? "");
    setVehicleInfo(currentBlock.vehicle_info ?? "");
    setPrice(String(currentBlock.price ?? 0));
    setNotes(currentBlock.order_notes || currentBlock.block_notes || "");
    setUserId(String(currentBlock.user_id ?? ""));
    setTaskTypeId(String(currentBlock.task_type_id ?? ""));
    setDate(dayjs(currentBlock.block_start).format("YYYY-MM-DD"));
    setStartHour(String(dayjs(currentBlock.block_start).hour()));
    setDurationMinutes(
      currentBlock.order_estimated_duration_minutes ||
        currentBlock.block_duration_minutes ||
        120
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Schließen"
      />

      <div className="relative z-10 flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[32px] border bg-white shadow-2xl sm:rounded-none sm:rounded-l-[32px]">
        <div
          className="sticky top-0 z-10 border-b px-4 py-4 md:px-6"
          style={{ backgroundColor: employeeTheme.softAlt }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: employeeTheme.soft,
                    borderColor: employeeTheme.border,
                    color: employeeTheme.text,
                  }}
                >
                  {currentBlock.user_name}
                </span>

                <span
                  className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: taskTheme.soft,
                    borderColor: taskTheme.border,
                    color: taskTheme.text,
                  }}
                >
                  {currentBlock.task_type_name || "Keine Arbeitsart"}
                </span>

                <span
                  className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: statusTheme.soft,
                    borderColor: statusTheme.border,
                    color: statusTheme.text,
                  }}
                >
                  {getStatusLabel(currentBlock.block_status)}
                </span>
              </div>

              <h2 className="font-heading truncate text-2xl font-semibold text-slate-900 md:text-3xl">
                {detailTitle}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {currentBlock.customer_name}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="g98-action-secondary"
            >
              Schließen
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Zeitraum
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {formatBlockRange(currentBlock)}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Dauer
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {formatHours(
                  currentBlock.order_estimated_duration_minutes ||
                    currentBlock.block_duration_minutes
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Preis
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {formatMoney(currentBlock.price, currentBlock.currency)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-6">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="g98-sheet-section">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-semibold text-slate-900">
                  Auftragsdetails
                </h3>
                <p className="text-sm text-slate-500">
                  Inhalte bearbeiten oder Auftrag neu planen
                </p>
              </div>

              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="g98-action-secondary"
                >
                  Bearbeiten & neu planen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setError(null);
                    resetToBlock();
                  }}
                  className="g98-action-secondary"
                >
                  Abbrechen
                </button>
              )}
            </div>

            {!isEditing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="g98-soft-card">
                  <div className="text-xs text-slate-500">Kund:in</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {currentBlock.customer_name}
                  </div>
                </div>

                <div className="g98-soft-card">
                  <div className="text-xs text-slate-500">Telefon</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {currentBlock.customer_phone || "-"}
                  </div>
                </div>

                <div className="g98-soft-card">
                  <div className="text-xs text-slate-500">Fahrzeug</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {currentBlock.vehicle_info || "-"}
                  </div>
                </div>

                <div className="g98-soft-card">
                  <div className="text-xs text-slate-500">Kennzeichen</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {currentBlock.license_plate || "-"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="g98-sheet-label">Kund:in</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Telefon</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Titel</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Fahrzeuginfo</label>
                  <input
                    value={vehicleInfo}
                    onChange={(e) => setVehicleInfo(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Preis</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Person</label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="g98-select"
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Arbeitsart</label>
                  <select
                    value={taskTypeId}
                    onChange={(e) => setTaskTypeId(e.target.value)}
                    className="g98-select"
                  >
                    {taskTypes.map((taskType) => (
                      <option key={taskType.id} value={taskType.id}>
                        {taskType.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Tag</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="g98-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="g98-sheet-label">Startzeit</label>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(e.target.value)}
                    className="g98-select"
                  >
                    {START_HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="g98-sheet-label">Dauer</div>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((option) => {
                      const active = durationMinutes === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDurationMinutes(option.value)}
                          className={`rounded-full border px-4 py-2 text-sm font-medium ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="g98-sheet-label">Notiz</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="g98-textarea min-h-[120px]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={saveEdit}
                    className="g98-action-primary w-full sm:w-auto"
                  >
                    {savingEdit ? "Speichert ..." : "Speichern & neu verteilen"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="g98-sheet-section">
            <h3 className="font-heading mb-3 text-lg font-semibold text-slate-900">
              Status ändern
            </h3>

            <div className="grid gap-2 sm:grid-cols-2">
              {STATUS_OPTIONS.map((option) => {
                const theme = getStatusTheme(option.value);
                const active = currentBlock.block_status === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={savingStatus}
                    onClick={() => updateStatus(option.value)}
                    className="rounded-2xl border px-4 py-3 text-sm font-medium transition"
                    style={{
                      backgroundColor: active ? theme.solid : theme.softAlt,
                      borderColor: active ? theme.solid : theme.border,
                      color: active ? "#ffffff" : theme.text,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="g98-sheet-section">
            <h3 className="font-heading mb-3 text-lg font-semibold text-slate-900">
              Notizen
            </h3>
            <div className="rounded-[24px] border bg-slate-50 p-4 text-sm text-slate-700">
              {currentBlock.order_notes ||
                currentBlock.block_notes ||
                "Keine Notiz vorhanden."}
            </div>
          </section>

          <section className="rounded-[26px] border border-red-200 bg-white p-4 md:p-5">
            <h3 className="font-heading mb-3 text-lg font-semibold text-red-700">
              Aktionen
            </h3>
            <button
              type="button"
              disabled={deleting}
              onClick={deleteOrder}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
            >
              {deleting ? "Löscht ..." : "Auftrag löschen"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}