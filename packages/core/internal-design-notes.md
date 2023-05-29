# Internal design notes

Motivation behind choices made when building this library. This motivation is sometimes based on intuition, so don't look at what's written here as set in stone.

## Why we can't have automatic dependency tracking like it works for signals?

Signals have initial value, so it's possible to immediately run a derived computation or an effect to determine dependencies. Asyncs do not.

## Why can't we have prevention of redundant computations like it works for signals?

As an example, imagine there are async variables A, B and C. B and C that depend on A, B depends on C, and no async callbacks are involved (B and C just synchronously emit a value computed from their dependencies). A emits a new value, we compute the value of B and notify its listeners, then we compute the value of C and process its listeners, but B is one of those listeners, so B will end up with a new value and we would have to notify its listeners the second time. Ideally, we would figure out that we should process C's listeners before B's, and then B will only emit once.

The problem is that the only way to achieve this would be to know the dependency graph. In the case of async variables, the only thing we know is which variables are subscribed to which, but if C is subscribed to A it doesn't necessarily mean that C will synchronously change its value if the value of A changes: instead, C can schedule a timeout that will change its value at a later time. Since we don't know the dependency graph as far as synchronous changes are concerned, we have no way of optimizing the execution.

The fact that prevention of redundant computations is unfeasible means that thankfully this library doesn't have to be coupled with a signals library - because if we had a dependency graph to analyze, that graph would have to be interleaved with the signals' graph.

## Why we can't have automatic unsubscription like it works for signals?

We're talking here about tracking dependencies between subscriptions, so imagine some subscription is initialized, and while the initialization function runs, another subscription is created - that would be a dependent subscription. The idea is to automatically unsubscribe dependent subscriptions if the parent subscription is unsubscribed.

One problem with this is that subscription/unsubscription process as a whole still can't be made fully automatic: there are cases when you need to unsub the child subscription while the parent one is still going. Say you're building an operator that looks at one async variable, and as long as it doesn't yet have any value, "falls back" to another async variable. As soon as the preferred variable gets a value, the fallback one will need to be unsubbed. So there has to be a client-exposed "unsubscribe" handle anyhow.

On the other hand, sometimes you want to keep the child subscription going when the parent subscription has been unsubbed, for example when you're making an HTTP request and you want to keep the request going even if the client unsubs early so you can cache the response. The need to keep the child going comes up only when side effects are involved, but look at it this way: there's nothing stopping the user from using `setTimeout` to get something to fire after the async variable is unsubbed - why should we stop them from doing the same thing using the `delay` function instead of `setTimeout`?

Also, there's a concern that we'd lose explicit order of execution of teardown functions.

In a way there already exists automatic unsubscription, it's just that it's implemented by operators. Curious how instead of a single border between library-land and user-land, we have two borders: one between async variables/constants and operators, and one between operators and everything else.

## Why not use abort errors for glitch prevention instead of deferring callbacks?

The idea is like this: say you're inside the `set` callback that is processing a new value of 1 of some async, and in the middle of it you set the async's value to 2. At this point we can throw an error which will abort the execution of the callback, catch the error, and start another callback, this time with a value of 2.

There is one technical problem with this approach, and there's another one which is more fundamental. The technical one is that the abort error can potentially be caught in the client code, which is not what we want. The more fundamental one is that if we go down this path, it will be possible to abort the `subscribe` callback at any point, and the user would need to provide clean-up logic to roll back from any intermediate state. It seems better DX to have atomic subscribe/unsubscribe.

## Why errors thrown by asyncs don't break the glitch-free guarantee?

This is because those errors are not based on the state of an async, but rather are just restrictions on the order in which you can call callbacks. So rather than saying "you can't call ... when an async is unsubscribed" (we don't have a notion of an "unsubscribed" state), we say "you can't call ... after you've called err/dispose or after the teardown function has been called". It's possible for example that an async has zero subscribers but the teardown function hasn't been called yet - in this case you're free to call set/err/dispose.

## Why when converting an async const to a promise, we have to wait for `dispose` to fire?

When an async const fires `dispose` right after `set`, it's nice that we do not unsubscribe before `dispose`, because this makes sure that any upstream asyncs keep the value after they've been unsubscribed. But that's not the reason why we do it this way - the real reason is that an async const can err after it has set a value, signalling "I have a new value here, so I can't satisfy the async const contract after all".
