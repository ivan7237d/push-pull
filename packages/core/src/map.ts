import { Async, AsyncConst, createAsync, isAsync } from "./asyncs";
import { NormalizeNeverAsync } from "./normalizeNeverAsync";

export const map =
  <
    ToMaybeAsync,
    FromMaybeAsync,
    From extends FromMaybeAsync extends Async<infer From>
      ? From
      : FromMaybeAsync,
    To extends ToMaybeAsync extends Async<infer To> ? To : ToMaybeAsync
  >(
    project: (from: From) => ToMaybeAsync
  ) =>
  (
    source: FromMaybeAsync
  ): NormalizeNeverAsync<
    FromMaybeAsync extends AsyncConst<unknown>
      ? ToMaybeAsync extends AsyncConst<unknown>
        ? AsyncConst<To>
        : ToMaybeAsync extends Async<unknown>
        ? Async<To>
        : AsyncConst<To>
      : FromMaybeAsync extends Async<unknown>
      ? Async<To>
      : ToMaybeAsync extends AsyncConst<unknown>
      ? AsyncConst<To>
      : ToMaybeAsync extends Async<unknown>
      ? Async<To>
      : AsyncConst<To>
  > =>
    createAsync((set, err) => {
      let unsubscribeFrom: (() => void) | undefined;
      let unsubscribeTo: (() => void) | undefined;

      const fromSet = (value: From) => {
        const projected = project(value);
        if (!unsubscribeFrom) {
          return;
        }
        if (isAsync(projected)) {
          const newUnsubscribeTo = projected(set, (error) => {
            unsubscribeTo = undefined;
            const unsubscribeFromSnapshot = unsubscribeFrom;
            unsubscribeFrom = undefined;
            err(error);
            unsubscribeFromSnapshot?.();
          });
          if (unsubscribeFrom as (() => void) | undefined) {
            const unsubscribeToSnapshot = unsubscribeTo;
            unsubscribeTo = newUnsubscribeTo;
            unsubscribeToSnapshot?.();
          } else {
            newUnsubscribeTo();
          }
        } else {
          set(projected);
          const unsubscribeToSnapshot = unsubscribeTo;
          unsubscribeTo = undefined;
          unsubscribeToSnapshot?.();
        }
      };

      if (isAsync(source)) {
        unsubscribeFrom = (source as Async<From>)(fromSet, (error) => {
          unsubscribeFrom = undefined;
          const unsubscribeToSnapshot = unsubscribeTo;
          unsubscribeTo = undefined;
          err(error);
          unsubscribeToSnapshot?.();
        });
      } else {
        fromSet(source as unknown as From);
      }

      return () => {
        const unsubscribeToSnapshot = unsubscribeTo;
        unsubscribeTo = undefined;
        const unsubscribeFromSnapshot = unsubscribeFrom;
        unsubscribeFrom = undefined;
        unsubscribeToSnapshot?.();
        unsubscribeFromSnapshot?.();
      };
    }) as any;
