// Cleanup's zero is terminal: a late scanner cannot resurrect quota charges.
export function resizeReservation(db, path, size) {
  return db
    .from("attachment_paths")
    .update({ reserved_bytes: size })
    .eq("path", path)
    .gt("reserved_bytes", 0);
}
