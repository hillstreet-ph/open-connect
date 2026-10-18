const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
] as const;

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [rangePart = "", stepText] = part.split("/");
    if (!rangePart) return false;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return false;
    let start = min;
    let end = max;
    if (rangePart !== "*") {
      const range = rangePart.split("-").map(Number);
      if (range.some((n) => !Number.isInteger(n))) return false;
      if (range.length === 1) start = end = range[0]!;
      else if (range.length === 2) [start, end] = range as [number, number];
      else return false;
    }
    return (
      start >= min &&
      end <= max &&
      start <= end &&
      value >= start &&
      value <= end &&
      (value - start) % step === 0
    );
  });
}

export function parseCron(expression: string): string[] {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5)
    throw new Error("Use a five-field cron expression: minute hour day month weekday.");
  for (const [index, field] of fields.entries()) {
    const [min, max] = FIELD_RANGES[index]!;
    if (
      !field.split(",").every((part) => {
        const [rangePart = "", stepText] = part.split("/");
        if (!rangePart) return false;
        if (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1))
          return false;
        if (rangePart === "*") return true;
        const bounds = rangePart.split("-").map(Number);
        return (
          bounds.length <= 2 &&
          bounds.every((n) => Number.isInteger(n) && n >= min && n <= max) &&
          (bounds.length < 2 || bounds[0]! <= bounds[1]!)
        );
      })
    )
      throw new Error("Cron fields support numbers, ranges, lists, steps, and * only.");
  }
  return fields;
}

export function cronMatches(expression: string, date: Date, timezone = "UTC"): boolean {
  const fields = parseCron(expression);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      minute: "numeric",
      hour: "numeric",
      day: "numeric",
      month: "numeric",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    throw new Error("Choose a valid IANA timezone.");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    values["weekday"] ?? "",
  );
  return fields.every((field, index) => {
    const value = [
      Number(values["minute"]),
      Number(values["hour"]),
      Number(values["day"]),
      Number(values["month"]),
      weekday,
    ][index]!;
    const [min, max] = FIELD_RANGES[index]!;
    return fieldMatches(field, value, min, max);
  });
}

/** Find the next matching minute, starting strictly after `after`. */
export function nextCronOccurrence(expression: string, after: Date, timezone = "UTC"): Date {
  parseCron(expression);
  const candidate = new Date(after);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  for (let i = 0; i < 527_040; i += 1) {
    if (cronMatches(expression, candidate, timezone)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error("Cron expression has no run time within the next year.");
}
