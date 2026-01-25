export function validateRange(startMin, endMin) {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) {
    return { ok: false, error: "start_min/end_min must be integers" };
  }
  if (endMin <= startMin) {
    return { ok: false, error: "end_min must be > start_min" };
  }
  return { ok: true };
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function findOverlap(existing, startMin, endMin) {
  for (const b of existing) {
    if (rangesOverlap(startMin, endMin, b.start_min, b.end_min)) {
      return b;
    }
  }
  return null;
}
