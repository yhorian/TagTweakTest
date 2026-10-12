---
title: 'Google Tag Gateway setup for developers'
description: 'What the official guides skip: the path you send to fps.goog is the return path. Notes from setting up five tags on one CloudFront distribution, with Lambda and Cloudflare Worker sketches.'
pubDate: 'Oct 9 2026'
---

## Why this article exists

Google Tag Gateway (GTG) on CloudFront only works if the full request path reaches Google's fps.goog origin, and the official guides never say why. This article records what we found setting up five tags on one CloudFront distribution, including the shape of every hit and a Lambda sketch.

Google's guides cover the console steps well. They say little about what the tag does with the path, what the health checks look like, or what happens when a CDN rewrites the URI. Where Google documents a behavior we say so. Where we only saw it in network traffic we mark it as observed. Domains and tag IDs are placeholders.

## Official instructions

Start with Google's own guides, then come back here for the parts they skip.

| Guide | Use it for |
| --- | --- |
| [Set up Google tag gateway for advertisers](https://developers.google.com/tag-platform/tag-manager/gateway/setup-guide?setup=manual) | Manual origin and behavior steps for CloudFront, healthy checks, script swap |
| [CloudFront with Tag Assistant](https://support.google.com/tagmanager/answer/17133552) | Guided click through setup of the same origin and behavior |
| [Set up with your CDN](https://support.google.com/tagmanager/answer/16222402) | Overview of supported CDNs and diagnostics |
| [Decide how to set up](https://developers.google.com/tag-platform/tag-manager/gateway/get-started) | Choosing between CDN, load balancer and server side |
| [CDN plus server side tagging](https://developers.google.com/tag-platform/tag-manager/gateway/sgtm-and-cdn) | Running GTG alongside an sGTM container |
| [Cookie handling](https://support.google.com/tagmanager/answer/16960855) | How GTG treats cookies |
| [CloudFront viewer headers (AWS)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-CloudFront-headers.html#CloudFront-headers-viewer-location) | Location headers CloudFront can forward |

The documented CloudFront setup, per tag:

- Origin domain `<tag id>.fps.goog`, protocol HTTPS only.
- Behavior path pattern `/metrics/*`, pointing at that origin.
- Compression off, viewer protocol HTTPS only, all seven HTTP methods allowed.
- Cache policy CachingDisabled, origin request policy AllViewerExceptHostHeader.
- Behavior precedence above every other behavior.
- Page script swap: gtag.js uses the bare path (`<script async src="/metrics/">`), gtm.js uses `/metrics/?id=GTM-XXXXXX`.

## The path you send to fps.goog is the return path

The path in the request to Google's origin is the path the tag then uses on your own domain. Google does not document this. We saw it by calling the origin directly and watching the tag's hits.

```
https://dc-1234567.fps.goog/whatever/          tag sends hits to https://www.example.com/whatever/
https://dc-1234567.fps.goog/whatever/healthy   ok
https://dc-1234567.fps.goog/healthy            Measurement path is empty.
```

What follows from that:

1. **The CDN must forward the full original URI.** If it strips the prefix, the tag has no return path. In our broken setup the tag fell back to sending hits straight to `region1.analytics.google.com/g/collect`.
2. **After the prefix, the rest is ignored for routing.** Google processes later hits without the prefix, so one wildcard on the CDN can cover everything under it.
3. **The tag finds its own path at runtime.** The served script reads its own `src` through `document.currentScript`, so load it from the first party path, relative.
4. **The origin host picks the tag, the path picks nothing.** `dc-1234567.fps.goog` serves tag DC-1234567 whatever the prefix is. A wildcard setup therefore needs something that chooses the host per tag.

## The hits you will see

Seven request shapes matter, and the CDN has to pass all of them through with the URI, method, query and body intact. Documented ones are marked D, observed ones O.

| Hit | Request | Notes |
| --- | --- | --- |
| Library load (D) | `GET /metrics-1/` | Returns JavaScript containing the tag ID. gtm.js adds `?id=GTM-XXXXXX`. |
| Path check (D) | `GET /metrics-1/healthy` | Returns `ok`. With no prefix it returns `Measurement path is empty.` |
| Geo check (D) | `GET /metrics-1/?validate_geo=healthy` | Returns `ok` when location headers reach the origin. |
| Load health probe (O) | `GET https://www.googletagmanager.com/gtag/js?id=DC-1234567&gtg_health=1` | Fires when the library loads, before other hits, to test the connection. Our captured example went to Google's own domain, so we read it as a fallback if the first party probe fails. Unconfirmed. |
| Encrypted measurement hit (O) | `GET /metrics-4/yaeewdswdAfkkPfirTb9lg...` | A long opaque token under your prefix, no `/g/collect`. It appears designed to dodge ad blocker pattern matching. |
| Service worker (O) | `GET /metrics-3/_/service_worker/69f0/sw.js?path=%2Fmetrics-3` | JavaScript. The `path` query repeats your prefix. Pass response headers through untouched. |
| Direct fallback (O) | `GET https://region1.analytics.google.com/g/collect?v=2&tid=G-XXXXXXX&...` | A standard hit. Seeing this means the tag is not in gateway mode, usually because the prefix was lost. |

The behavior uses CachingDisabled for all of these, library load included, and the CDN must not compress or rewrite any of them.

## Doing it yourself with a Lambda

A Lambda has one job: choose the fps.goog host for the tag and leave the URI alone. The request flow:

1. The browser requests `https://www.example.com/metrics-1/...`.
2. One CloudFront behavior with pattern `/metrics-*/*` matches. Caching is off, all methods are allowed, viewer headers except Host are forwarded.
3. A Lambda@Edge origin request function reads the first path segment, maps `metrics-1` to a tag, and switches the origin and Host header to that tag's `fps.goog` host.
4. `<tag id>.fps.goog` answers, and CloudFront returns the response unchanged.

Sketch of step 3. It is untested against production, so verify it with the checks in the testing section. Lambda@Edge functions deploy from us-east-1 and attach to the behavior as an origin request trigger. The behavior's default origin must be a custom origin, HTTPS only. Any one fps.goog origin will do.

```js
const tags = { 1: 'g-xxxxxxx', 2: 'aw-xxxxxxx', 3: 'aw-yyyyyyy', 4: 'dc-xxxxxxx', 5: 'dc-yyyyyyy' };

export const handler = async ({ Records: [{ cf: { request: r } }] }) => {
  const tag = tags[r.uri.match(/^\/metrics-(\d+)\//)?.[1]];
  if (!tag) return r;
  r.origin.custom.domainName = `${tag}.fps.goog`;
  r.headers.host = [{ key: 'Host', value: r.origin.custom.domainName }];
  return r;
};
```

The handler never assigns `r.uri`, which is the whole point. A lighter option is a CloudFront Function on viewer request, also untested here:

```js
import cf from 'cloudfront';
const tags = { 1: 'g-xxxxxxx', 2: 'aw-xxxxxxx', 3: 'aw-yyyyyyy', 4: 'dc-xxxxxxx', 5: 'dc-yyyyyyy' };

function handler({ request: r }) {
  const tag = tags[r.uri.match(/^\/metrics-(\d+)\//)?.[1]];
  if (tag) cf.updateRequestOrigin({ domainName: `${tag}.fps.goog` });
  return r;
}
```

This needs the cloudfront-js-2.0 runtime. Google's Cloudflare and Fastly guides take a different route: a single `fps.goog` host plus an `X-Gtg-Tag-Id` header carrying the tag ID. We did not try that on CloudFront.

If you would rather proxy inside the Lambda, it must do all of this:

- Request `https://<tag id>.fps.goog` plus the original path and query, same method and body.
- Send Host as the tag's fps.goog host, and pass the viewer IP and location headers.
- Return status, headers and body exactly as received. No redirect following, no gzip changes, base64 for binary bodies.
- Never cache, and handle every HTTP method.

## Doing it yourself with a Cloudflare Worker

On Cloudflare, a Worker can do the whole job: take hits arriving on `/metrics/` and forward them to `<tag id>.fps.goog/metrics/` with the same path and query. The flow:

1. The browser requests `https://www.example.com/metrics/...`.
2. A Worker route on `www.example.com/metrics/*` runs the Worker.
3. The Worker swaps the hostname to the tag's fps.goog host, keeps method, path, query and body, and adds the location and client IP headers.
4. `g-xxxxxxx.fps.goog` answers, and the Worker returns the response untouched.

Sketch of the Worker. It is untested against production, so check it with the tests in the next sections. The first path segment picks the tag, so add one entry per tag and path.

```js
const tags = { metrics: 'g-xxxxxxx', metrics2: 'aw-xxxxxxx' };

export default {
  fetch(req) {
    const url = new URL(req.url);
    const tag = tags[url.pathname.split('/')[1]];
    if (!tag) return fetch(req);
    const { country, regionCode, latitude, longitude, city } = req.cf;
    url.hostname = `${tag}.fps.goog`;
    const out = new Request(url, req);
    out.headers.set('X-Forwarded-Country', country);
    out.headers.set('X-Forwarded-Region', regionCode);
    out.headers.set('X-Forwarded-Geolocation', `latlong=${latitude},${longitude};city=${city}`);
    out.headers.append('X-Forwarded-For', req.headers.get('CF-Connecting-IP'));
    return fetch(out, { redirect: 'manual' });
  },
};
```

The path is never touched, so fps.goog sees `/metrics/healthy` and the tag gets its return path. The header names match Google's own Cloudflare Snippet sample. Scope the route to the metrics paths only, and keep caching off for them, as with CloudFront.

Google's own Cloudflare options need no Worker. There is an [in UI Cloudflare setup](https://support.google.com/tagmanager/answer/16061406), and the manual guide uses a Snippet, which Google lists as supported on Cloudflare Pro plans and above.

## CloudFront checklist and what breaks

Most failures come down to five settings, and the URI check is the one the docs underplay.

- **Origin path field empty** on every fps.goog origin. It prepends to the request path and never strips.
- **Precedence.** Your metrics behavior must rank above every other behavior, including catch alls. CloudFront uses the first match.
- **Behavior settings.** CachingDisabled, HTTPS only, compression off, all seven methods. Without POST, measurement hits fail.
- **Origin request policy** AllViewerExceptHostHeader, so Host becomes the fps.goog host and location headers pass.
- **No URI rewrite anywhere in front of the origin.** Our distribution sent the origin call without the `/metrics-N/` prefix. Whatever does that (a CloudFront Function, Lambda@Edge, an upstream rewrite) has to go or be changed to leave the URI alone.

Symptoms map cleanly to causes:

| Symptom | Likely cause |
| --- | --- |
| `/metrics-1/healthy` returns `Measurement path is empty.` | The CDN stripped the prefix before the origin call |
| Script loads, but hits go to `region1.analytics.google.com/g/collect` | Same cause: no return path, so the tag is not in gateway mode |
| Every path returns the same tag ID | One shared origin serving all prefixes |
| Response is HTML | The request fell through to your default behavior, check precedence |
| Script works, POST hits fail | Allowed methods limited to GET and HEAD |

## Testing and debugging

Three requests show whether the path survives the CDN. On Windows PowerShell use `curl.exe`, because `curl` is an alias for Invoke-WebRequest.

```sh
curl -s https://g-xxxxxxx.fps.goog/metrics-1/healthy   # ok: Google accepts the prefix
curl -s https://g-xxxxxxx.fps.goog/healthy             # Measurement path is empty.
curl -s https://www.example.com/metrics-1/healthy      # must be ok: your CDN kept the prefix
```

If the third call says `Measurement path is empty.`, the CDN is stripping the prefix. Then prove the tag behaves in a browser. Paste this on your own page. It sends a real pageview with debug mode on:

```js
const s = document.createElement('script');
s.src = '/metrics-1/';
s.async = true;
document.head.appendChild(s);
window.dataLayer = window.dataLayer || [];
window.gtag = function () { dataLayer.push(arguments); };
gtag('js', new Date());
gtag('config', 'G-XXXXXXX', { debug_mode: true });
setTimeout(() => console.log(performance.getEntriesByType('resource').map(e => e.name).filter(n => /collect|metrics/.test(n))), 4000);
```

Pass: hit URLs start with `/metrics-1/`. Fail: `region1.analytics.google.com/g/collect`.

Two gotchas from our debugging. First, the gtag.js install uses the bare path as `src`, with no `?id=` and no `/gtag/js`. Second, Google's gateway steps never mention `transport_url`, so leave it out of your config calls unless you have tested it.

## Feedback for Google

GTG would be easier to deploy if the path carried no meaning beyond being the return path. Our wish list:

- **Accept naked paths.** Let the CDN send any prefix, with no tag ID baked into routing, so one wildcard covers every tag.
- **Document the return path behavior.** The fact that the origin path becomes the first party path is the key to the whole setup, and it is nowhere in the guides.
- **Document the extra hits.** Health probes, the encrypted path hits and the service worker all need the CDN to behave, and none is described.
- **Make errors explain themselves.** `Measurement path is empty.` should say the request URL has no prefix.
- **Say what a failed probe does.** Does the tag fall back to Google's own domain, and silently?
