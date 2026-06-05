"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface MonthContextValue {
  year: number;
  month: number; // 0-indexed
  monthLabel: string; // e.g. "April 2026"
  prevMonth: () => void;
  nextMonth: () => void;
  goToday: () => void;
  isCurrentMonth: boolean;
}

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function goToday() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth());
  }

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();

  return (
    <MonthContext.Provider
      value={{
        year,
        month,
        monthLabel: `${MONTH_NAMES[month]} ${year}`,
        prevMonth,
        nextMonth,
        goToday,
        isCurrentMonth,
      }}
    >
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth() {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error("useMonth must be used within MonthProvider");
  return ctx;
}

const HIDE_MONTH_BAR = ["/accounts", "/settings"];

export function MonthBar() {
  const { monthLabel, prevMonth, nextMonth, goToday, isCurrentMonth } = useMonth();
  const pathname = usePathname();
  if (HIDE_MONTH_BAR.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="w-full flex items-center justify-center gap-1 py-1.5 border-b border-slate-800 bg-slate-900">
      <button
        onClick={prevMonth}
        className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-lg leading-none"
      >
        ‹
      </button>
      <span className="w-36 text-center text-sm font-semibold text-slate-200 tabular-nums">
        {monthLabel}
      </span>
      <button
        onClick={nextMonth}
        className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-lg leading-none"
      >
        ›
      </button>
      {!isCurrentMonth && (
        <button
          onClick={goToday}
          className="ml-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
        >
          Today
        </button>
      )}
    </div>
  );
}
