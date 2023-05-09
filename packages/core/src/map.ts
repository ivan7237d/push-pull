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
      let disposedFrom = false;
      let disposedTo = false;

      const fromSet = (value: From) => {
        unsubscribeTo?.();
        let projected;
        try {
          projected = project(value);
        } catch (error) {
          err(error);
          return;
        }

        const maybeDispose = () => {
          if (disposedFrom) {
            dispose();
          } else {
            disposedTo = true;
          }
        };

        if (isAsync(projected)) {
          unsubscribeTo = projected({
            set,
            err,
            dispose: maybeDispose,
          });
        } else {
          set(projected);
          maybeDispose();
        }
      };

      if (isAsync(source)) {
        unsubscribeFrom = (source as AsyncVar<From>)({
          set: fromSet,
          err,
          dispose: () => {
            if (disposedTo) {
              dispose();
            } else {
              disposedFrom = true;
            }
          },
        });
      } else {
        disposedFrom = true;
        fromSet(source as unknown as From);
      }

      return () => {
        unsubscribeTo?.();
        unsubscribeFrom?.();
      };
    }) as any;
