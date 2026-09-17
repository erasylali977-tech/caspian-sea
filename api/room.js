const memory = globalThis.__AQUARIUM_ROOMS__ || new Map();
globalThis.__AQUARIUM_ROOMS__ = memory;

const MAX_FISH = 24;
const MAX_IMAGE = 220_000;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function send(res, data, status = 200) {
  cors(res);
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function roomId(req) {
  let raw = req.query?.id || "";
  if (!raw && req.url) {
    try {
      raw = new URL(req.url, "http://local").searchParams.get("id") || "";
    } catch {
      raw = "";
    }
  }
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
}

function kvEnabled() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvGet(id) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/aquarium:${id}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return { fish: [] };
  const payload = await res.json();
  if (!payload?.result) return { fish: [] };
  try {
    return typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  } catch {
    return { fish: [] };
  }
}

async function kvSet(id, room) {
  await fetch(`${process.env.KV_REST_API_URL}/set/aquarium:${id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(JSON.stringify(room)),
  });
}

async function loadRoom(id) {
  if (kvEnabled()) return kvGet(id);
  return memory.get(id) || { fish: [] };
}

async function saveRoom(id, room) {
  if (kvEnabled()) {
    await kvSet(id, room);
    return;
  }
  memory.set(id, room);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    send(res, { ok: true });
    return;
  }

  const id = roomId(req);
  if (!id) {
    send(res, { error: "missing id" }, 400);
    return;
  }

  if (req.method === "GET") {
    const room = await loadRoom(id);
    send(res, { fish: room.fish || [], updatedAt: room.updatedAt || 0 });
    return;
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const room = await loadRoom(id);
    room.fish = Array.isArray(room.fish) ? room.fish : [];

    if (body.type === "clear") {
      room.fish = [];
      room.updatedAt = Date.now();
      await saveRoom(id, room);
      send(res, { ok: true, count: 0 });
      return;
    }

    if (body.type === "addFish" && body.fish?.id && (body.fish.image || body.fish.model3d)) {
      if (body.fish.image && String(body.fish.image).length > MAX_IMAGE) {
        send(res, { error: "image too large" }, 413);
        return;
      }
      if (!room.fish.some((item) => item.id === body.fish.id)) {
        room.fish.push({
          id: String(body.fish.id).slice(0, 40),
          image: body.fish.image || "",
          model3d: body.fish.model3d || "",
          kind: body.fish.kind || "fish",
          templateId: body.fish.templateId || "",
          createdAt: Date.now(),
        });
        if (room.fish.length > MAX_FISH) room.fish = room.fish.slice(-MAX_FISH);
        room.updatedAt = Date.now();
        await saveRoom(id, room);
      }
    }

    send(res, { ok: true, count: room.fish.length });
    return;
  }

  send(res, { error: "method not allowed" }, 405);
}
