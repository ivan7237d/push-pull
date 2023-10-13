import { pull } from "./reactivity";

export const createMemo =
  <Value>(get: () => Value): (() => Value) =>
  () =>
    pull(get);
