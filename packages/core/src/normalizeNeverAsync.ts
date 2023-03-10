import { Async, AsyncConst } from "./asyncs";

export type NormalizeNeverAsync<Arg> = Arg extends Async<never>
  ? AsyncConst<never>
  : Arg;
