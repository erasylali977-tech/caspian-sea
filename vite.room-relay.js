const rooms = new Map();
const MAX_FISH = 24;

function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function roomId(url) {
  const id = String(url.searchParams.get("id") || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return id;
}

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { fish: [], updatedAt: 0 });
  return rooms.get(id);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    sendJson(res, { ok: true });
    return;
  }
  const id = roomId(url);
  if (!id) {
    sendJson(res, { error: "missing id" }, 400);
    return;
  }
  const room = getRoom(id);
  if (req.method === "GET") {
    sendJson(res, { fish: room.fish, updatedAt: room.updatedAt });
    return;
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    if (body.type === "clear") {
      room.fish = [];
      room.updatedAt = Date.now();
      sendJson(res, { ok: true, count: 0 });
      return;
    }
    if (body.type === "addFish" && body.fish?.id && (body.fish.image || body.fish.model3d)) {
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
      }
    }
    sendJson(res, { ok: true, count: room.fish.length });
    return;
  }
  sendJson(res, { error: "method not allowed" }, 405);
}

export function localRoomRelay() {
  return {
    name: "local-room-relay",
    configureServer(server) {
      const run = (req, res) => handle(req, res);
      server.middlewares.use("/api/room", run);
      server.middlewares.use("/.netlify/functions/room", run);
    },
    configurePreviewServer(server) {
      const run = (req, res) => handle(req, res);
      server.middlewares.use("/api/room", run);
      server.middlewares.use("/.netlify/functions/room", run);
    },
  };
}
