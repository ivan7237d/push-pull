import { AsyncConst } from "./createAsyncConst";
import { AsyncVar } from "./createAsyncVar";

export type NormalizeNeverAsync<Arg> = Arg extends AsyncVar<never, infer Error>
  ? AsyncConst<never, Error>
  : Arg;
