type ThemeToken = {
  solid: string;
  soft: string;
  softAlt: string;
  text: string;
  border: string;
};

const EMPLOYEE_NAME_MAP: Record<string, ThemeToken> = {
  Michi: {
    solid: "#2563eb",
    soft: "#dbeafe",
    softAlt: "#eff6ff",
    text: "#1d4ed8",
    border: "#93c5fd",
  },
  Sandra: {
    solid: "#7c3aed",
    soft: "#ede9fe",
    softAlt: "#f5f3ff",
    text: "#6d28d9",
    border: "#c4b5fd",
  },
  Erwin: {
    solid: "#059669",
    soft: "#d1fae5",
    softAlt: "#ecfdf5",
    text: "#047857",
    border: "#86efac",
  },
};

const EMPLOYEE_ID_MAP: Record<number, ThemeToken> = {
  1: EMPLOYEE_NAME_MAP.Michi,
  2: EMPLOYEE_NAME_MAP.Sandra,
  3: EMPLOYEE_NAME_MAP.Erwin,
};

const DEFAULT_EMPLOYEE_THEME: ThemeToken = {
  solid: "#334155",
  soft: "#e2e8f0",
  softAlt: "#f8fafc",
  text: "#334155",
  border: "#cbd5e1",
};

const TASK_THEME_MAP: Record<string, ThemeToken> = {
  Innenreinigung: {
    solid: "#0ea5e9",
    soft: "#e0f2fe",
    softAlt: "#f0f9ff",
    text: "#0369a1",
    border: "#7dd3fc",
  },
  Außenaufbereitung: {
    solid: "#10b981",
    soft: "#d1fae5",
    softAlt: "#ecfdf5",
    text: "#047857",
    border: "#6ee7b7",
  },
  Unterbodenkonservierung: {
    solid: "#f59e0b",
    soft: "#fef3c7",
    softAlt: "#fffbeb",
    text: "#b45309",
    border: "#fcd34d",
  },
  "Diverse Arbeiten": {
    solid: "#64748b",
    soft: "#e2e8f0",
    softAlt: "#f8fafc",
    text: "#475569",
    border: "#cbd5e1",
  },
};

const DEFAULT_TASK_THEME: ThemeToken = {
  solid: "#64748b",
  soft: "#e2e8f0",
  softAlt: "#f8fafc",
  text: "#475569",
  border: "#cbd5e1",
};

export function getEmployeeTheme(input: {
  userName?: string | null;
  userId?: number | null;
}): ThemeToken {
  if (input.userName && EMPLOYEE_NAME_MAP[input.userName]) {
    return EMPLOYEE_NAME_MAP[input.userName];
  }

  if (input.userId && EMPLOYEE_ID_MAP[input.userId]) {
    return EMPLOYEE_ID_MAP[input.userId];
  }

  return DEFAULT_EMPLOYEE_THEME;
}

export function getTaskTheme(input: {
  taskName?: string | null;
  taskColor?: string | null;
}): ThemeToken {
  if (input.taskName && TASK_THEME_MAP[input.taskName]) {
    return TASK_THEME_MAP[input.taskName];
  }

  if (input.taskColor) {
    return {
      solid: input.taskColor,
      soft: `${input.taskColor}20`,
      softAlt: `${input.taskColor}10`,
      text: input.taskColor,
      border: `${input.taskColor}55`,
    };
  }

  return DEFAULT_TASK_THEME;
}

export function getStatusTheme(status: string | null | undefined): ThemeToken {
  switch (status) {
    case "in_arbeit":
      return {
        solid: "#2563eb",
        soft: "#dbeafe",
        softAlt: "#eff6ff",
        text: "#1d4ed8",
        border: "#93c5fd",
      };
    case "pausiert":
      return {
        solid: "#f59e0b",
        soft: "#fef3c7",
        softAlt: "#fffbeb",
        text: "#b45309",
        border: "#fcd34d",
      };
    case "erledigt":
      return {
        solid: "#64748b",
        soft: "#e2e8f0",
        softAlt: "#f8fafc",
        text: "#475569",
        border: "#cbd5e1",
      };
    default:
      return {
        solid: "#0f172a",
        soft: "#e2e8f0",
        softAlt: "#f8fafc",
        text: "#334155",
        border: "#cbd5e1",
      };
  }
}

export function getStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "in_arbeit":
      return "In Arbeit";
    case "pausiert":
      return "Pausiert";
    case "erledigt":
      return "Erledigt";
    default:
      return "Geplant";
  }
}

export function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}