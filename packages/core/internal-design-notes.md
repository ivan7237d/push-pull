# Internal design notes

Motivation behind choices made when building this library.

## Why we can't have automatic dependency tracking or prevention of redundant computations like it works for signals?

Signals have initial value, so it's possible to immediately run a derived computation or an effect to determine dependencies. Asyncs do not.

## Why not use abort errors for glitch prevention instead of deferring callbacks?

The idea is like this: say you're inside the `set` callback that is processing a new value of 1 of some async, and in the middle of it you set the async's value to 2. At this point we can throw an error which will abort the execution of the callback, catch the error, and start another callback, this time with a value of 2.

This is attractive in some ways, for example the `map` operator wouldn't have to check multiple times while processing a new mapped value to see if the output async is still subscribed. There is one technical problem with this approach, and there's another one which is more fundamental. The technical one is that the abort error can potentially be caught in the client code, which is not what we want. The more fundamental one is that if we go down this path, it will be possible to abort the `subscribe` callback at any point, and the user would need to provide clean-up logic to roll back from any intermediate state. It seems better DX to have atomic subscribe/unsubscribe.

## Why errors thrown by asyncs don't break the glitch-free guarantee?

This is because those errors are not based on the state of an async, but rather are just restrictions on the order in which you can call callbacks. So rather than saying "you can't call ... when an async is unsubscribed" (we don't have a notion of an "unsubscribed" state), we say "you can't call ... after you've called err/dispose or after the teardown function has been called". It's possible for example that an async has zero subscribers but the teardown function hasn't been called yet - in this case you're free to call set/err/dispose.

## Why when converting an async const to a promise, we have to wait for `dispose` to fire?

When an async const fires `dispose` right after `set`, it's nice that we do not unsubscribe before `dispose`, because this makes sure that any upstream asyncs keep the value after they've been unsubscribed. But that's not the reason why we do it this way - the real reason is that an async const can err after it has set a value, signalling "I have a new value here, so I can't satisfy the async const contract after all".

# Open questions

## Why we can't have automatic unsubscription like it works for signals?

Does this mean no manual unsubscribe? In that case, how to implement snapshot/fallback operators?

## Should `map` unsub from inner async _after_ subscribing to a new inner async?

## Is there a way to make the map operator implementation simpler?

## Are some callbacks theoretically possible to do run synchronously?
