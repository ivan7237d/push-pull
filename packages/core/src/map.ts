import { AsyncConst } from "./createAsyncConst";
import { AsyncVar, createAsyncVar, isAsync } from "./createAsyncVar";
import { NormalizeNeverAsync } from "./normalizeNeverAsync";

export const map =
  <
    MaybeAsyncFrom,
    MaybeAsyncTo,
    ErrorFrom,
    ErrorTo,
    ValueFrom extends MaybeAsyncFrom extends AsyncVar<
      infer ValueFrom,
      ErrorFrom
    >
      ? ValueFrom
      : MaybeAsyncFrom,
    ValueTo extends MaybeAsyncTo extends AsyncVar<infer ValueTo, ErrorTo>
      ? ValueTo
      : MaybeAsyncTo
  >(
    project: (from: ValueFrom) => MaybeAsyncTo
  ) =>
  (
    source: MaybeAsyncFrom
  ): NormalizeNeverAsync<
    MaybeAsyncFrom extends AsyncConst<unknown, unknown>
      ? MaybeAsyncTo extends AsyncConst<unknown, unknown>
        ? AsyncConst<ValueTo, ErrorFrom | ErrorTo>
        : MaybeAsyncTo extends AsyncVar<unknown, unknown>
        ? AsyncVar<ValueTo, ErrorFrom | ErrorTo>
        : AsyncConst<ValueTo, ErrorFrom>
      : MaybeAsyncFrom extends AsyncVar<unknown, unknown>
      ? MaybeAsyncTo extends AsyncVar<unknown, unknown>
        ? AsyncVar<ValueTo, ErrorFrom | ErrorTo>
        : AsyncVar<ValueTo, ErrorFrom>
      : MaybeAsyncTo extends AsyncConst<unknown, unknown>
      ? AsyncConst<ValueTo, ErrorTo>
      : MaybeAsyncTo extends AsyncVar<unknown, unknown>
      ? AsyncVar<ValueTo, ErrorTo>
      : AsyncConst<ValueTo, never>
  > =>
    createAsyncVar(({ set, err, dispose }) => {
      let unsubscribeFrom: (() => void) | undefined;
      let unsubscribeTo: (() => void) | undefined;

      const setFrom = (value: ValueFrom) => {
        const disposeTo = () => {
          if (unsubscribeFrom) {
            unsubscribeTo = undefined;
          } else {
            dispose();
          }
        };

        unsubscribeTo?.();
        const projected = project(value);
        if (isAsync(projected)) {
          unsubscribeTo = projected({
            set,
            err: (error) => {
              unsubscribeFrom?.();
              err(error);
            },
            dispose: disposeTo,
          });
        } else {
          set(projected);
          disposeTo();
        }
      };

      if (isAsync(source)) {
        unsubscribeFrom = (source as AsyncVar<ValueFrom, ErrorFrom>)({
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
        setFrom(source as unknown as ValueFrom);
      }

      return () => {
        unsubscribeTo?.();
        unsubscribeFrom?.();
      };
    }) as any;
