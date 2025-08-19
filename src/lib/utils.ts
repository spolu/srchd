export function removeNulls<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((v): v is T => v !== null && v !== undefined);
}

export function newID4(): string {
  return Math.random().toString(36).substring(2, 6);
}
