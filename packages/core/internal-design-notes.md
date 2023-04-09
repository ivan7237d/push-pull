# Internal design notes

Motivation behind choices made when building this library.

## Why we can't have automatic dependency tracking or prevention of redundant computations like it works for signals?

Signals have initial value, so it's possible to immediately run a derived computation or an effect to determine dependencies. Asyncs do not.

## Why we can't have automatic unsubscription like it works for signals?

If an async A, when subscribed, subscribes to an async B, does it mean that when we unsub from A, B should always be unsubbed as well? The answer is no: imagine that B is an async that fetches some URL, and A is a wrapper for B that adds caching logic. It's reasonable (and that's how it works in Tanstack Query for example) that if you subscribed to A and then unsub before the fetch is done, we would still want to wait for the fetch to complete so we can cache the result, so we'll keep the B subscription going even after A in unsubbed.

## Why not use abort errors to achieve glitch prevention instead of deferring callbacks?

The idea is like this: say you're inside the `set` callback that is processing a new value of 1 of some async, and in the middle of it you set the async's value to 2. At this point we can throw an error which will abort the execution of the callback, catch the error, and start another callback, this time with a value of 2.

This is attractive in some ways, for example the `map` operator wouldn't have to check multiple times while processing a new mapped value to see if the output async is still subscribed. There is one technical problem with this approach, and there's another one which is more fundamental. The technical one is that the abort error can potentially be caught in the client code, which is not what we want. The more fundamental one is that if we go down this path, it will be possible to abort the `subscribe` callback at any point, and the user would need to provide clean-up logic to roll back from any intermediate state. It seems better DX to have atomic subscribe/unsubscribe.
