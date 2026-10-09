const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86_400_000;

export interface DateRange {
  from: Date;
  to: Date;
}

/** Start of the IST calendar day containing `d`, as a UTC instant. */
export function startOfDayIst(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS,
  );
}

/** Inclusive IST day range; defaults to the last 30 days. Capped at 366 days. */
export function resolveRange(from?: Date, to?: Date, defaultDays = 30): DateRange {
  const end = startOfDayIst(to ?? new Date());
  const endExclusive = new Date(end.getTime() + DAY_MS);
  let start = startOfDayIst(from ?? new Date(end.getTime() - (defaultDays - 1) * DAY_MS));
  if (start > end) start = end;
  if (endExclusive.getTime() - start.getTime() > 366 * DAY_MS)
    start = new Date(endExclusive.getTime() - 366 * DAY_MS);
  return { from: start, to: endExclusive };
}

/** `YYYY-MM-DD` (IST) for every day in the range, to zero-fill chart series. */
export function daysIn(range: DateRange): string[] {
  const out: string[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) {
    out.push(new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10));
  }
  return out;
}
