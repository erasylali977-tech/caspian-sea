import Peer from "peerjs";

export const HOUSE_ROOM = "home";

function cleanCode(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
}

export function newRoomCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function relayUrl(code) {
  return `/.netlify/functions/room?id=${encodeURIComponent(code)}`;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function relayGet(code) {
  const res = await fetch(relayUrl(code), { cache: "no-store" });
  if (!res.ok) throw new Error("relay");
  return res.json();
}

async function relayPost(code, payload) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(relayUrl(code), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await wait(400 * (attempt + 1));
  }
  return false;
}

function lsKey(code) {
  return `aq-tank-v4-${code}`;
}

function lsRead(code) {
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey(code)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function lsPush(code, fish) {
  const all = lsRead(code);
  if (all.some((item) => item.id === fish.id)) return;
  all.push(fish);
  localStorage.setItem(lsKey(code), JSON.stringify(all.slice(-24)));
}

function lsClear(code) {
  localStorage.removeItem(lsKey(code));
}

export function openRoom(code, { role }) {
  const room = cleanCode(code);
  const listeners = new Set();
  const connections = new Set();
  const seen = new Set();
  const pending = [];
  let peer = null;
  let bc = null;
  let stopped = false;
  let retries = 0;

  const emit = (msg, via) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "addFish" && msg.fish?.id) {
      if (seen.has(msg.fish.id)) return;
      seen.add(msg.fish.id);
      if (!listeners.size) {
        pending.push(msg);
        return;
      }
    }
    if (msg.type === "clear") {
      seen.clear();
      pending.length = 0;
    }
    listeners.forEach((fn) => fn(msg, via));
  };

  try {
    bc = new BroadcastChannel(`aquarium-${room}`);
    bc.onmessage = (e) => emit(e.data, "tab");
  } catch {
    bc = null;
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== lsKey(room) || !e.newValue) return;
    lsRead(room).forEach((fish) => emit({ type: "addFish", fish }, "storage"));
  });

  const peerId = `reef${room}`;

  const attachConn = (conn) => {
    conn.on("open", () => {
      connections.add(conn);
      emit({ type: "status", online: true }, "peer");
    });
    conn.on("data", (data) => emit(data, "peer"));
    conn.on("close", () => {
      connections.delete(conn);
      if (!connections.size) emit({ type: "status", online: false }, "peer");
    });
  };

  const startHost = () => {
    if (stopped) return;
    try {
      peer?.destroy();
    } catch {}
    peer = new Peer(peerId, { debug: 0 });
    peer.on("connection", attachConn);
    peer.on("open", () => emit({ type: "status", hostReady: true }, "peer"));
    peer.on("error", (err) => {
      if (stopped) return;
      if (String(err?.type) === "unavailable-id" && retries < 6) {
        retries += 1;
        window.setTimeout(startHost, 700 * retries);
      }
    });
  };

  const startJoin = () => {
    if (stopped) return;
    try {
      peer?.destroy();
    } catch {}
    peer = new Peer({ debug: 0 });
    peer.on("open", () => {
      const conn = peer.connect(peerId, { reliable: true });
      attachConn(conn);
    });
    peer.on("error", () => {
      emit({ type: "status", online: false }, "peer");
      if (!stopped && retries < 8) {
        retries += 1;
        window.setTimeout(startJoin, 1200);
      }
    });
  };

  if (role === "host") startHost();
  else startJoin();

  const drainLocal = () => {
    lsRead(room).forEach((fish) => emit({ type: "addFish", fish }, "storage"));
  };

  const poll = async () => {
    drainLocal();
    try {
      const data = await relayGet(room);
      (data.fish || []).forEach((fish) => emit({ type: "addFish", fish }, "relay"));
    } catch {
      /* static host without functions */
    }
  };
  const pollTimer = window.setInterval(poll, 900);

  return {
    code: room,
    on(fn) {
      listeners.add(fn);
      pending.splice(0).forEach((msg) => fn(msg, "queue"));
      drainLocal();
      return () => listeners.delete(fn);
    },
    send(msg) {
      if (msg?.type === "addFish" && msg.fish) lsPush(room, msg.fish);
      if (msg?.type === "clear") lsClear(room);
      try {
        bc?.postMessage(msg);
      } catch {}
      connections.forEach((conn) => {
        try {
          if (conn.open) conn.send(msg);
        } catch {}
      });
      if (msg?.type === "addFish" || msg?.type === "clear") {
        relayPost(room, msg).catch(() => {});
      }
    },
    destroy() {
      stopped = true;
      window.clearInterval(pollTimer);
      try {
        bc?.close();
      } catch {}
      try {
        peer?.destroy();
      } catch {}
    },
  };
}
