"use client";

import { useEffect, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CurrencyInput } from "@/components/CurrencyInput";
import { DateInput } from "@/components/DateInput";
import type { Bill, BillInput, DiscretionaryItem, DiscretionaryFrequency } from "@/lib/types";
import type { BillFrequency } from "@/lib/bills";
import { frequencyLabel, computeNextDueDate, monthlyEquivalent } from "@/lib/bills";
import { useMonth } from "@/components/MonthContext";
import { InlineConfirm } from "@/components/InlineConfirm";

// ── Design tokens ─────────────────────────────────────────────────────────────

const btn = {
  primary:
    "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
  primarySm:
    "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-150 hover:bg-emerald-500 hover:shadow-md hover:shadow-emerald-500/25 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-150 hover:bg-slate-600 hover:text-white active:scale-95",
  ghost:
    "text-xs font-medium text-emerald-400 transition-colors duration-150 hover:text-emerald-300",
};

const card = "rounded-xl bg-slate-800 ring-1 ring-white/5 p-4";

const inputCls =
  "w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 ring-1 ring-white/5 transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/50";

const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQUENCIES: BillFrequency[] = [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
];

function needsAnchorDate(freq: BillFrequency) {
  return freq !== "monthly" && freq !== "semi_monthly";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDueDate(bill: Bill): string {
  const next = computeNextDueDate({
    frequency: bill.frequency,
    due_day: bill.due_day,
    due_day_2: bill.due_day_2,
    anchor_date: bill.anchor_date,
    amount: bill.amount,
  });
  if (!next) return "—";
  return new Date(next + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmt$(n: number): string {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(iso: string) {
  const dateOnly = String(iso).slice(0, 10);
  return new Date(dateOnly + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Delete confirmation popup ─────────────────────────────────────────────────

// ── Bill form (add / edit) ────────────────────────────────────────────────────

interface BillFormProps {
  initial?: Bill;
  onSave: (data: BillInput) => Promise<void>;
  onCancel: () => void;
}

function dayFromPicker(picker: string): number | undefined {
  return picker ? new Date(picker + "T00:00:00").getDate() : undefined;
}

function pickerFromDay(day: number | null | undefined): string {
  return day ? `2025-01-${String(day).padStart(2, "0")}` : "";
}

function BillForm({ initial, onSave, onCancel }: BillFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? Number(initial.amount).toFixed(2) : "0.00");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(initial?.frequency ?? "monthly");
  const [dueDatePicker, setDueDatePicker] = useState<string>(pickerFromDay(initial?.due_day));
  const [dueDatePicker2, setDueDatePicker2] = useState<string>(pickerFromDay(initial?.due_day_2));
  const [anchorDate, setAnchorDate] = useState(initial?.anchor_date ?? "");
  const [recurring, setRecurring] = useState(initial?.recurring ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const usesDueDays = frequency === "monthly" || frequency === "semi_monthly";

  const err = (field: string) => errors[field]
    ? <p className="text-xs text-red-400 mt-1">{errors[field]}</p>
    : null;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim())                                    errs.name       = "Name is required";
    if (parseFloat(amount) <= 0)                         errs.amount     = "Amount must be greater than $0";
    if (usesDueDays && !dueDatePicker)                   errs.dueDate    = "Due date is required";
    if (needsAnchorDate(frequency) && !anchorDate)       errs.anchorDate = "Date is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        amount: parseFloat(amount),
        category: category.trim() || undefined,
        frequency,
        due_day: usesDueDays ? dayFromPicker(dueDatePicker) : undefined,
        due_day_2: frequency === "semi_monthly" ? dayFromPicker(dueDatePicker2) : undefined,
        anchor_date: needsAnchorDate(frequency) && anchorDate ? anchorDate : undefined,
        recurring,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={card + " space-y-4 mb-6 border border-emerald-500/10"}>
      <h2 className="text-sm font-semibold text-slate-200">{initial ? "Edit Bill" : "Add Bill"}</h2>

      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Netflix"
            className={inputCls + (errors.name ? " ring-red-500/50" : "")}
          />
          {err("name")}
        </div>

        {/* Amount */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Amount <span className="text-slate-600">(per occurrence)</span></label>
          <CurrencyInput value={amount} onChange={setAmount} className={inputCls + " tabular-nums" + (errors.amount ? " ring-red-500/50" : "")} />
          {err("amount")}
        </div>

        {/* Category */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>
            Category <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Utilities"
            className={inputCls}
          />
        </div>

        {/* Frequency */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as BillFrequency)}
            className={inputCls}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{frequencyLabel(f)}</option>
            ))}
          </select>
        </div>

        {/* Due day(s) — monthly and semi_monthly */}
        {usesDueDays && (
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {frequency === "semi_monthly" ? "First due date" : "Due date"}{" "}
              <span className="text-slate-600">(pick any month)</span>
            </label>
            <DateInput value={dueDatePicker} onChange={setDueDatePicker} className={inputCls + " cursor-pointer" + (errors.dueDate ? " ring-red-500/50" : "")} />
            {err("dueDate")}
          </div>
        )}

        {frequency === "semi_monthly" && (
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              Second due date <span className="text-slate-600">(pick any month)</span>
            </label>
            <DateInput value={dueDatePicker2} onChange={setDueDatePicker2} className={inputCls + " cursor-pointer"} />
          </div>
        )}

        {/* Anchor date — non-monthly/semi_monthly */}
        {needsAnchorDate(frequency) && (
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>A known due date</label>
            <DateInput value={anchorDate} onChange={setAnchorDate} className={inputCls + " cursor-pointer" + (errors.anchorDate ? " ring-red-500/50" : "")} />
            {err("anchorDate")}
          </div>
        )}

        {/* Recurring toggle */}
        <div className="col-span-2 flex items-center gap-2">
          <input
            id="recurring"
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="accent-emerald-500"
          />
          <label htmlFor="recurring" className="text-sm text-slate-300">Recurring</label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className={btn.primary}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Add Bill"}
        </button>
        <button type="button" onClick={onCancel} className={btn.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Planned expenses section ──────────────────────────────────────────────────

interface PlannedExpense {
  id: string;
  name: string;
  amount: number;
  planned_date: string;
  notes: string | null;
}

const EMPTY_PLANNED = { name: "", amount: "0.00", planned_date: "", notes: "" };

function PlannedForm({
  initial = EMPTY_PLANNED,
  onSave,
  onCancel,
  saving,
}: {
  initial?: typeof EMPTY_PLANNED;
  onSave: (f: typeof EMPTY_PLANNED) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof EMPTY_PLANNED>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n; });
  };

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim())             errs.name         = "Name is required";
    if (parseFloat(form.amount) <= 0)  errs.amount       = "Amount must be greater than $0";
    if (!form.planned_date)            errs.planned_date = "Date is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  }

  const err = (field: string) => errors[field]
    ? <p className="text-xs text-red-400 mt-1">{errors[field]}</p>
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Name</label>
          <input type="text" placeholder="e.g. Beach Trip" value={form.name} onChange={(e) => set({ name: e.target.value })}
            className={inputCls + (errors.name ? " ring-red-500/50" : "")} />
          {err("name")}
        </div>
        <div>
          <label className={labelCls}>Amount</label>
          <CurrencyInput value={form.amount} onChange={(v) => set({ amount: v })}
            className={inputCls + (errors.amount ? " ring-red-500/50" : "")} />
          {err("amount")}
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <DateInput value={form.planned_date} onChange={(v) => set({ planned_date: v })}
            className={inputCls + (errors.planned_date ? " ring-red-500/50" : "")} />
          {err("planned_date")}
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notes <span className="text-slate-600">(optional)</span></label>
          <input type="text" placeholder="e.g. flights + hotel" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className={btn.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
      </div>
    </form>
  );
}

function PlannedSection() {
  const { year, month } = useMonth();
  const [all, setAll]           = useState<PlannedExpense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<PlannedExpense | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function load() {
    try {
      const data = await fetch(`/api/planned-expenses?year=${year}&month=${month}`).then((r) => r.json());
      setAll(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load planned expenses.");
    }
  }

  useEffect(() => { load(); }, [year, month]);

  // Default date for new form = 1st of selected month
  const defaultDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  async function handleSave(form: typeof EMPTY_PLANNED) {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/planned-expenses/${editing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, amount: parseFloat(form.amount), planned_date: form.planned_date, notes: form.notes || null }),
        });
        if (res.ok) { setEditing(null); await load(); }
        else setError("Failed to update expense. Please try again.");
      } else {
        const res = await fetch("/api/planned-expenses", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, amount: parseFloat(form.amount), planned_date: form.planned_date, notes: form.notes || null }),
        });
        if (res.ok) { setShowForm(false); await load(); }
        else setError("Failed to add expense. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/planned-expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmId(null);
      await load();
    } else {
      setError("Failed to delete expense. Please try again.");
    }
  }

  const plannedTotal = all.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Planned Expenses</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {plannedTotal > 0
              ? <><span className="text-orange-400 font-semibold tabular-nums">{fmt$(plannedTotal)}</span> this month</>
              : "One-time expenses by month"}
          </p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className={btn.primarySm}>+ Add</button>
        )}
      </div>
    <section className={card + " space-y-3"}>

      {error && (
        <p className="text-xs text-rose-400 flex items-center gap-2">
          {error}
          <button onClick={() => setError(null)} className="underline hover:no-underline">Dismiss</button>
        </p>
      )}

      {showForm && (
        <div className="rounded-lg border border-orange-400/20 bg-slate-900/50 p-3">
          <PlannedForm
            initial={{ ...EMPTY_PLANNED, planned_date: defaultDate }}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
            saving={saving}
          />
        </div>
      )}

      {all.length === 0 && !showForm ? (
        <div className="py-4 flex flex-col items-center text-center gap-2">
          <p className="text-sm text-slate-400 font-medium">No planned expenses this month</p>
          <p className="text-xs text-slate-600 max-w-xs">Upcoming vacation, car repair, or big purchase? Add it here so the AI factors it into your savings calculation.</p>
          <button onClick={() => setShowForm(true)} className="mt-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">+ Add a planned expense</button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {all.map((p) => (
            <li key={p.id}>
              {editing?.id === p.id ? (
                <div className="rounded-lg border border-orange-400/20 bg-slate-900/50 p-3">
                  <PlannedForm
                    initial={{ name: p.name, amount: String(p.amount), planned_date: String(p.planned_date).slice(0, 10), notes: p.notes ?? "" }}
                    onSave={handleSave}
                    onCancel={() => setEditing(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div className="flex items-start justify-between rounded-lg border-l-2 border-orange-400/30 bg-slate-900/60 px-4 py-3 hover:border-orange-400/60 hover:bg-slate-900 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(p.planned_date)}{p.notes ? ` · ${p.notes}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                    <p className="text-sm font-bold tabular-nums text-orange-300">{fmt$(p.amount)}</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => { setShowForm(false); setEditing(p); }} className={btn.ghost}>Edit</button>
                      <InlineConfirm
                        isConfirming={confirmId === p.id}
                        onRequest={() => setConfirmId(p.id)}
                        onConfirm={() => handleDelete(p.id)}
                        onCancel={() => setConfirmId(null)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
    </div>
  );
}

// ── Discretionary section ─────────────────────────────────────────────────────

function DiscretionarySection() {
  const [items, setItems] = useState<DiscretionaryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DiscretionaryItem | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/discretionary");
      if (res.ok) setItems(await res.json());
      else setError("Failed to load buffer items.");
    } catch {
      setError("Failed to load buffer items.");
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(name: string, amount: number, frequency: DiscretionaryFrequency, id?: string) {
    setError(null);
    const url = id ? `/api/discretionary/${id}` : "/api/discretionary";
    const method = id ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, frequency }),
      });
      if (res.ok) { setShowForm(false); setEditing(null); await load(); }
      else setError("Failed to save buffer item. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/discretionary/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmingId(null);
      await load();
    } else {
      setError("Failed to delete buffer item. Please try again.");
    }
  }

  const discMonthlyTotal = items.reduce((sum, item) => sum + monthlyEquivalent({
    frequency: item.frequency, due_day: null, due_day_2: null, anchor_date: null, amount: item.amount,
  }), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Buffer</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {discMonthlyTotal > 0
              ? <><span className="text-violet-400 font-semibold tabular-nums">{fmt$(discMonthlyTotal)}</span> / month</>
              : "Discretionary amounts kept as a buffer each paycheck"}
          </p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className={btn.primarySm}>
            + Add
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-400 flex items-center gap-2">
          {error}
          <button onClick={() => setError(null)} className="underline hover:no-underline">Dismiss</button>
        </p>
      )}

      {(showForm || editing) && (
        <DiscretionaryForm
          initial={editing ?? undefined}
          onSave={(name, amount, frequency) => handleSave(name, amount, frequency, editing?.id)}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {items.length === 0 && !showForm ? (
        <div className="py-4 flex flex-col items-center text-center gap-2">
          <p className="text-sm text-slate-400 font-medium">No buffer items yet</p>
          <p className="text-xs text-slate-600 max-w-xs">Reserve a spending buffer each paycheck — like groceries or gas — so it's not counted toward savings.</p>
          <button onClick={() => setShowForm(true)} className="mt-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">+ Add a buffer item</button>
        </div>
      ) : (
        <div className={card + " space-y-2"}>
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-3 ring-1 ring-white/5 hover:bg-slate-900 transition-colors duration-150">
              <div>
                <p className="text-sm font-semibold text-slate-100">{item.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{DISC_FREQUENCIES.find((f) => f.value === item.frequency)?.label ?? "Monthly"}</p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <span className="tabular-nums text-sm font-bold text-slate-200">
                  {fmt$(item.amount)}
                </span>
                <button
                  onClick={() => { setEditing(item); setShowForm(false); setConfirmingId(null); }}
                  className={btn.ghost}
                >
                  Edit
                </button>
                <InlineConfirm
                  isConfirming={confirmingId === item.id}
                  onRequest={() => setConfirmingId(item.id)}
                  onConfirm={() => handleDelete(item.id)}
                  onCancel={() => setConfirmingId(null)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DISC_FREQUENCIES: { value: DiscretionaryFrequency; label: string }[] = [
  { value: "monthly",      label: "Monthly" },
  { value: "semi_monthly", label: "Twice a month" },
  { value: "biweekly",     label: "Every 2 weeks" },
  { value: "weekly",       label: "Weekly" },
];

function DiscretionaryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DiscretionaryItem;
  onSave: (name: string, amount: number, frequency: DiscretionaryFrequency) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? Number(initial.amount).toFixed(2) : "0.00");
  const [frequency, setFrequency] = useState<DiscretionaryFrequency>(initial?.frequency ?? "monthly");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(name.trim(), parseFloat(amount), frequency); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className={card + " space-y-3 border border-emerald-500/10"}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Label</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spending buffer"
            className={inputCls}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Amount <span className="text-slate-600">(per occurrence)</span></label>
          <CurrencyInput value={amount} onChange={setAmount} className={inputCls + " tabular-nums"} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as DiscretionaryFrequency)}
            className={inputCls}
          >
            {DISC_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className={btn.primary}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className={btn.secondary}>Cancel</button>
      </div>
    </form>
  );
}

// ── Sortable bill row ─────────────────────────────────────────────────────────

function SortableBillRow({
  bill, editingId, confirmingId, onEdit, onEditSave, onEditCancel, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: {
  bill: Bill;
  editingId: string | null;
  confirmingId: string | null;
  onEdit: () => void;
  onEditSave: (data: BillInput) => Promise<void>;
  onEditCancel: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: bill.id });

  const isEditing = editingId === bill.id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={isEditing ? "" : "group flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-3 ring-1 ring-white/5 hover:bg-slate-900 transition-colors duration-150"}
    >
      {isEditing ? (
        <BillForm initial={bill} onSave={onEditSave} onCancel={onEditCancel} />
      ) : (
        <>
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 touch-none"
            tabIndex={-1}
          >
            <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/>
              <circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
              <circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
            </svg>
          </button>

          <div className="flex items-center justify-between flex-1 min-w-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">{bill.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {frequencyLabel(bill.frequency)} · next {formatDueDate(bill)}
                {!bill.recurring && " · one-time"}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className="tabular-nums text-sm font-bold text-slate-200">{fmt$(bill.amount)}</span>
              <button onClick={onEdit} className={btn.ghost}>Edit</button>
              <InlineConfirm
                isConfirming={confirmingId === bill.id}
                onRequest={onDeleteRequest}
                onConfirm={onDeleteConfirm}
                onCancel={onDeleteCancel}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sortable category card ────────────────────────────────────────────────────

function SortableCategoryCard({
  cat, children,
}: {
  cat: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat:${cat}` });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={card + " group"}
    >
      <div className="flex items-center gap-2 mb-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 touch-none"
          tabIndex={-1}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/>
            <circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
            <circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
          </svg>
        </button>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{cat}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    try {
      const res = await fetch("/api/bills");
      if (res.ok) setBills(await res.json());
      else setError("Failed to load bills.");
    } catch {
      setError("Failed to load bills.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function persistOrder(ordered: Bill[]) {
    await fetch("/api/bills/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ordered.map((b, i) => ({ id: b.id, sort_order: i }))),
    });
  }

  function grouped(billList: Bill[]) {
    return billList.reduce<Record<string, Bill[]>>((acc, b) => {
      const key = b.category ?? "Uncategorized";
      (acc[key] ??= []).push(b);
      return acc;
    }, {});
  }

  function categories(billList: Bill[]) {
    // Order by first appearance in the sorted bill list
    const seen = new Set<string>();
    const order: string[] = [];
    for (const b of billList) {
      const k = b.category ?? "Uncategorized";
      if (!seen.has(k)) { seen.add(k); order.push(k); }
    }
    return order;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId   = String(over.id);

    let newBills: Bill[];

    if (activeId.startsWith("cat:") && overId.startsWith("cat:")) {
      // Reorder entire category blocks
      const cats = categories(bills);
      const fromIdx = cats.indexOf(activeId.slice(4));
      const toIdx   = cats.indexOf(overId.slice(4));
      const newCats = arrayMove(cats, fromIdx, toIdx);
      const g = grouped(bills);
      newBills = newCats.flatMap((c) => g[c] ?? []);
    } else if (!activeId.startsWith("cat:") && !overId.startsWith("cat:")) {
      // Reorder bill within (or between) categories
      const oldIdx = bills.findIndex((b) => b.id === activeId);
      const newIdx = bills.findIndex((b) => b.id === overId);
      newBills = arrayMove(bills, oldIdx, newIdx);
    } else {
      return;
    }

    setBills(newBills);
    await persistOrder(newBills);
  }

  async function handleAdd(data: BillInput) {
    setError(null);
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setShowForm(false); await load(); }
    else setError("Failed to add bill. Please try again.");
  }

  async function handleEdit(data: BillInput) {
    if (!editing) return;
    setError(null);
    const res = await fetch(`/api/bills/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setEditing(null); await load(); }
    else setError("Failed to update bill. Please try again.");
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmingId(null);
      await load();
    } else {
      setError("Failed to delete bill. Please try again.");
    }
  }

  const g = grouped(bills);
  const cats = categories(bills);

  const monthlyBills = bills
    .filter((b) => b.recurring && b.active)
    .reduce((sum, b) => sum + monthlyEquivalent({
      frequency: b.frequency, due_day: b.due_day, due_day_2: b.due_day_2,
      anchor_date: b.anchor_date, amount: b.amount,
    }), 0);
  const recurringCount = bills.filter((b) => b.recurring && b.active).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <p className="text-sm text-slate-500 mt-0.5">Bills, planned expenses & buffer</p>
        {!loading && (
          <p className="mt-2">
            <span className="text-2xl font-bold tabular-nums text-rose-400">
              {monthlyBills > 0 ? fmt$(monthlyBills) : "—"}
            </span>
            <span className="ml-2 text-sm text-slate-500">
              / month in bills{recurringCount > 0 ? ` · ${recurringCount} recurring` : ""}
            </span>
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-400 flex items-center gap-2">
          {error}
          <button onClick={() => setError(null)} className="underline hover:no-underline">Dismiss</button>
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Bills</h2>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className={btn.primarySm}>
            + Add Bill
          </button>
        )}
      </div>

      {showForm && <BillForm onSave={handleAdd} onCancel={() => setShowForm(false)} />}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : bills.length === 0 && !showForm ? (
        <div className="rounded-xl bg-slate-800/60 ring-1 ring-white/5 p-8 flex flex-col items-center text-center gap-3">
          <p className="text-slate-200 font-semibold">No bills yet</p>
          <p className="text-sm text-slate-500 max-w-xs leading-relaxed">Add your recurring bills and subscriptions so the AI knows what comes out of each paycheck when calculating your savings.</p>
          <button onClick={() => setShowForm(true)} className={btn.primary}>+ Add your first bill</button>
        </div>
      ) : bills.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cats.map((c) => `cat:${c}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {cats.map((cat) => (
                <SortableCategoryCard key={cat} cat={cat}>
                  <SortableContext items={(g[cat] ?? []).map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    {(g[cat] ?? []).map((bill) => (
                      <SortableBillRow
                        key={bill.id}
                        bill={bill}
                        editingId={editing?.id ?? null}
                        confirmingId={confirmingId}
                        onEdit={() => { setShowForm(false); setEditing(bill); setConfirmingId(null); }}
                        onEditSave={handleEdit}
                        onEditCancel={() => setEditing(null)}
                        onDeleteRequest={() => setConfirmingId(bill.id)}
                        onDeleteConfirm={() => handleDelete(bill.id)}
                        onDeleteCancel={() => setConfirmingId(null)}
                      />
                    ))}
                  </SortableContext>
                </SortableCategoryCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      <hr className="border-slate-700/50" />
      <PlannedSection />

      <hr className="border-slate-700/50" />
      <DiscretionarySection />
    </div>
  );
}
