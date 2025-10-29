
---
title: 'Track browser actions: Reload/refresh, backwards, forwards'
description: 'With the performance API, you can track browser actions such as reloads, forwards and backwards.'
pubDate: 'Mar 01 2025'
---

# Tracking how the user reached your page

With the introduction of the [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API), you can track browser actions such as reloads, forwards and backwards.

## Tracking reloads, backs, and forwards

``` js
performance.getEntriesByType("navigation")[0]?.type;
```

This little snippet will return the type of navigation event.
