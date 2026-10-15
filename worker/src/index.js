// Cloudflare Worker that proxies a trimmed view of my Brewfather batches to the
// homebrewing page, keeping the API key server-side.
//
// GET / -> { current: Batch | null, last: Batch | null, updated: epoch ms }

const API = "https://api.brewfather.app/v2";
const CACHE_SECONDS = 600;
const ACTIVE_STATUSES = ["Brewing", "Fermenting", "Conditioning"];

// Per-isolate cache; the Cache API is a no-op on workers.dev, so this is what
// keeps us well under Brewfather's 500 calls/hour limit there.
let memo = { body: null, expires: 0 };

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    const cache = caches.default;
    const cacheKey = new Request(new URL("/", request.url).toString());

    let body = memo.expires > Date.now() ? memo.body : null;
    if (!body) {
      const cached = await cache.match(cacheKey);
      if (cached) body = await cached.text();
    }
    if (!body) {
      try {
        body = JSON.stringify(await buildSummary(env));
      } catch (err) {
        console.error(err);
        // Serve stale data rather than nothing if Brewfather is unavailable
        if (memo.body) {
          body = memo.body;
        } else {
          return json({ error: "Brewfather unavailable" }, 502, cors);
        }
      }
      memo = { body, expires: Date.now() + CACHE_SECONDS * 1000 };
      ctx.waitUntil(
        cache.put(cacheKey, new Response(body, {
          headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` },
        })),
      );
    }

    return new Response(body, {
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      },
    });
  },
};

async function buildSummary(env) {
  const [active, completed] = await Promise.all([
    Promise.all(ACTIVE_STATUSES.map((s) => listBatches(env, s))).then((r) => r.flat()),
    listBatches(env, "Completed"),
  ]);

  const current = newest(active);
  const last = newest(completed);

  const [currentBatch, lastBatch, reading] = await Promise.all([
    current ? getBatch(env, current._id) : null,
    last ? getBatch(env, last._id) : null,
    current ? lastReading(env, current._id) : null,
  ]);

  return {
    current: currentBatch ? summarise(currentBatch, reading) : null,
    last: lastBatch ? summarise(lastBatch, null) : null,
    updated: Date.now(),
  };
}

// Brewfather pages at 50; walk every page so the newest batch is never missed
async function listBatches(env, status) {
  const batches = [];
  let startAfter = null;
  for (;;) {
    const params = new URLSearchParams({ status, limit: "50" });
    if (startAfter) params.set("start_after", startAfter);
    const page = await brewfather(env, `/batches?${params}`);
    batches.push(...page);
    if (page.length < 50) return batches;
    startAfter = page[page.length - 1]._id;
  }
}

function getBatch(env, id) {
  return brewfather(env, `/batches/${id}`);
}

// Only present when a hydrometer (Tilt, iSpindel, etc.) or manual readings are logged
async function lastReading(env, id) {
  try {
    return await brewfather(env, `/batches/${id}/readings/last`);
  } catch {
    return null;
  }
}

async function brewfather(env, path) {
  const auth = btoa(`${env.BREWFATHER_USER_ID}:${env.BREWFATHER_API_KEY}`);
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Brewfather ${path}: ${res.status}`);
  return res.json();
}

function newest(batches) {
  return batches.reduce(
    (best, b) => (!best || (b.brewDate ?? 0) > (best.brewDate ?? 0) ? b : best),
    null,
  );
}

// Only expose what the page renders; field names follow Brewfather's batch model,
// falling back to recipe estimates where measurements haven't been logged yet
function summarise(batch, reading) {
  const recipe = batch.recipe ?? {};
  return {
    name: batch.name ?? recipe.name ?? null,
    recipeName: recipe.name ?? null,
    batchNo: batch.batchNo ?? null,
    status: batch.status ?? null,
    style: recipe.style?.name ?? null,
    brewDate: batch.brewDate ?? null,
    fermentationStartDate: batch.fermentationStartDate ?? null,
    bottlingDate: batch.bottlingDate ?? null,
    og: batch.measuredOg ?? recipe.og ?? null,
    fg: batch.measuredFg ?? recipe.fg ?? null,
    abv: batch.measuredAbv ?? recipe.abv ?? null,
    ibu: batch.estimatedIbu ?? recipe.ibu ?? null,
    colour: batch.estimatedColor ?? recipe.color ?? null,
    fermentables: (batch.batchFermentables ?? recipe.fermentables ?? []).map((f) => f.name),
    hops: unique((batch.batchHops ?? recipe.hops ?? []).map((h) => h.name)),
    yeasts: (batch.batchYeasts ?? recipe.yeasts ?? []).map((y) => y.name),
    reading: reading?.sg
      ? { sg: reading.sg, temp: reading.temp ?? null, time: reading.time ?? null }
      : null,
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim());
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
