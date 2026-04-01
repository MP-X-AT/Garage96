"use client";

import { useEffect, useState } from "react";
import { CreateOrderForm } from "@/components/calendar/create-order-form";

type UserOption = {
  id: number;
  name: string;
};

type TaskTypeOption = {
  id: number;
  name: string;
  color: string | null;
};

type DayCreateOrderModalProps = {
  date: string;
  users: UserOption[];
  taskTypes: TaskTypeOption[];
};

export function DayCreateOrderModal({
  date,
  users,
  taskTypes,
}: DayCreateOrderModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", onKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <section className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="g98-action-primary"
        >
          + Termin anlegen
        </button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/45 p-3 md:p-6">
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[30px] border bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4 md:px-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Termin anlegen
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Neuer Auftrag für den ausgewählten Tag.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                aria-label="Modal schließen"
              >
                Schließen
              </button>
            </div>

            <div className="max-h-[calc(92vh-82px)] overflow-y-auto p-4 md:p-6">
              <CreateOrderForm date={date} users={users} taskTypes={taskTypes} />
            </div>
          </div>

          <button
            type="button"
            aria-label="Overlay schließen"
            onClick={() => setOpen(false)}
            className="absolute inset-0 -z-10 cursor-default"
          />
        </div>
      ) : null}
    </>
  );
}