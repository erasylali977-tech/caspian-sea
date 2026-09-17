const memory = globalThis.__AQUARIUM_ROOMS__ || new Map();
globalThis.__AQUARIUM_ROOMS__ = memory;

const MAX_FISH = 24;
const MAX_IMAGE = 220_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}

function onNetlify() {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return Boolean(globalThis.Netlify || env?.NETLIFY || env?.NETLIFY_DEV);
}

async function getStoreSafe() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "aquarium-rooms", consistency: "strong" });
  } catch {
    return null;
  }
}

async function loadRoom(id, store) {
  if (store) {
    const value = await store.get(id, { type: "json" });
    return value || { fish: [] };
  }
  return memory.get(id) || { fish: [] };
}

async function saveRoom(id, room, store) {
  if (store) {
    await store.setJSON(id, room);
  } else {
    memory.set(id, room);
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);

  if (!id) return json({ error: "missing id" }, 400);

  const store = await getStoreSafe();
  if (!store && onNetlify()) {
    return json({ error: "store unavailable" }, 503);
  }

  if (req.method === "GET") {
    const room = await loadRoom(id, store);
    return json({
      fish: room.fish || [],
      updatedAt: room.updatedAt || 0,
    });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const room = await loadRoom(id, store);
    room.fish = Array.isArray(room.fish) ? room.fish : [];

    if (body.type === "clear") {
      room.fish = [];
      room.updatedAt = Date.now();
      await saveRoom(id, room, store);
      return json({ ok: true, count: 0 });
    }

    if (body.type === "addFish" && body.fish?.id && (body.fish.image || body.fish.model3d)) {
      if (body.fish.image && String(body.fish.image).length > MAX_IMAGE) {
        return json({ error: "image too large" }, 413);
      }
      if (!room.fish.some((f) => f.id === body.fish.id)) {
        room.fish.push({
          id: String(body.fish.id).slice(0, 40),
          image: body.fish.image || "",
          model3d: body.fish.model3d || "",
          kind: body.fish.kind || "fish",
          templateId: body.fish.templateId || "",
          createdAt: Date.now(),
        });
        if (room.fish.length > MAX_FISH) {
          room.fish = room.fish.slice(-MAX_FISH);
        }
        room.updatedAt = Date.now();
        await saveRoom(id, room, store);
      }
    }

    return json({ ok: true, count: room.fish.length });
  }

  return json({ error: "method not allowed" }, 405);
};
