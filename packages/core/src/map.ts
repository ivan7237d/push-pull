import { AsyncConst } from "./createAsyncConst";
import { AsyncVar, createAsyncVar, isAsync } from "./createAsyncVar";
import { NormalizeNeverAsync } from "./normalizeNeverAsync";

export const map =
  <
    ToMaybeAsync,
    FromMaybeAsync,
    From extends FromMaybeAsync extends AsyncVar<infer From>
      ? From
      : FromMaybeAsync,
    To extends ToMaybeAsync extends AsyncVar<infer To> ? To : ToMaybeAsync
  >(
    project: (from: From) => ToMaybeAsync
  ) =>
  (
    source: FromMaybeAsync
  ): NormalizeNeverAsync<
    FromMaybeAsync extends AsyncConst<unknown>
      ? ToMaybeAsync extends AsyncConst<unknown>
        ? AsyncConst<To>
        : ToMaybeAsync extends AsyncVar<unknown>
        ? AsyncVar<To>
        : AsyncConst<To>
      : FromMaybeAsync extends AsyncVar<unknown>
      ? AsyncVar<To>
      : ToMaybeAsync extends AsyncConst<unknown>
      ? AsyncConst<To>
      : ToMaybeAsync extends AsyncVar<unknown>
      ? AsyncVar<To>
      : AsyncConst<To>
  > =>
    createAsyncVar(({ set, err, dispose }) => {
      let unsubscribeFrom: (() => void) | undefined;
      let unsubscribeTo: (() => void) | undefined;

      const setFrom = (value: From) => {
        const errTo = (error: unknown) => {
          unsubscribeFrom?.();
          err(error);
        };

        const disposeTo = () => {
          if (unsubscribeFrom) {
            unsubscribeTo = undefined;
          } else {
            dispose();
          }
        };

        unsubscribeTo?.();
        let projected;
        try {
          projected = project(value);
        } catch (error) {
          errTo(error);
          return;
        }
        if (isAsync(projected)) {
          unsubscribeTo = projected({
            set,
            err: errTo,
            dispose: disposeTo,
          });
        } else {
          set(projected);
          disposeTo();
        }
      };

      if (isAsync(source)) {
        unsubscribeFrom = (source as AsyncVar<From>)({
          set: setFrom,
          err: (error) => {
            unsubscribeTo?.();
            err(error);
          },
          dispose: () => {
            if (unsubscribeTo) {
              unsubscribeFrom = undefined;
            } else {
              dispose();
            }
          },
        });
      } else {
        setFrom(source as unknown as From);
      }

      return () => {
        unsubscribeTo?.();
        unsubscribeFrom?.();
      };
    }) as any;
