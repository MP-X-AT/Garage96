import dayjs from "dayjs";

export type CalendarExceptionSeed = {
  exceptionDate: string;
  exceptionType: "holiday" | "closed" | "custom_hours" | "info";
  name: string;
  isWorkingDay: boolean;
  displayOnly: boolean;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};

function easterSunday(year: number) {
  // Gauß/Oudin für Gregorianischen Kalender
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return dayjs(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

export function getAustrianStatutoryHolidays(year: number): CalendarExceptionSeed[] {
  const easter = easterSunday(year);

  return [
    {
      exceptionDate: `${year}-01-01`,
      exceptionType: "holiday",
      name: "Neujahr",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-01-06`,
      exceptionType: "holiday",
      name: "Heilige Drei Könige",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: easter.add(1, "day").format("YYYY-MM-DD"),
      exceptionType: "holiday",
      name: "Ostermontag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-05-01`,
      exceptionType: "holiday",
      name: "Staatsfeiertag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: easter.add(39, "day").format("YYYY-MM-DD"),
      exceptionType: "holiday",
      name: "Christi Himmelfahrt",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: easter.add(50, "day").format("YYYY-MM-DD"),
      exceptionType: "holiday",
      name: "Pfingstmontag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: easter.add(60, "day").format("YYYY-MM-DD"),
      exceptionType: "holiday",
      name: "Fronleichnam",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-08-15`,
      exceptionType: "holiday",
      name: "Mariä Himmelfahrt",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-10-26`,
      exceptionType: "holiday",
      name: "Nationalfeiertag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-11-01`,
      exceptionType: "holiday",
      name: "Allerheiligen",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-12-08`,
      exceptionType: "holiday",
      name: "Mariä Empfängnis",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-12-25`,
      exceptionType: "holiday",
      name: "Christtag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
    {
      exceptionDate: `${year}-12-26`,
      exceptionType: "holiday",
      name: "Stephanitag",
      isWorkingDay: false,
      displayOnly: false,
      startTime: null,
      endTime: null,
      notes: "Gesetzlicher Feiertag Österreich",
    },
  ];
}

export function getStyriaInfoDays(year: number): CalendarExceptionSeed[] {
  return [
    {
      exceptionDate: `${year}-03-19`,
      exceptionType: "info",
      name: "Festtag Landespatron Steiermark (Hl. Josef)",
      isWorkingDay: true,
      displayOnly: true,
      startTime: null,
      endTime: null,
      notes: "Nur Info, kein gesetzlicher Feiertag für Sperrlogik",
    },
  ];
}

export function buildAustriaStyriaCalendarSeeds(year: number): CalendarExceptionSeed[] {
  return [
    ...getAustrianStatutoryHolidays(year),
    ...getStyriaInfoDays(year),
  ];
}