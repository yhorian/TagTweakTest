---
title: 'Enriching GA4 Search Events'
description: 'Working with GA4 on search events and trying to add more context to them'
pubDate: '19 April 2024'
---

There are two inbuilt events for this: 'search' and 'view_search_results'. You can automatically populate 'view_search_results' using Enhanced Measurements or fire it from the page. Defaults for scraping this from the query string are detailed in the [Analytics documentation](https://support.google.com/analytics/answer/9216061?hl=en). The are:

- q
- s
- search
- query
- keyword

The field for the search term is 'search_term'. There is a second field called unique_search_term which is populated "when it has a value of 1 (i.e. when the string is unique to that session)" - no idea what this means.
