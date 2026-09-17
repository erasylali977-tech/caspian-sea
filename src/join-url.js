function isLoopback(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function originFromHost(host) {
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${host}${port}`;
}

export async function lanOrigin() {
  const host = location.hostname;
  if (!isLoopback(host)) return location.origin;

  const found = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
      try {
        pc.close();
      } catch {}
    };

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel("aq");
    const timer = window.setTimeout(() => finish(""), 1200);
    pc.onicecandidate = (event) => {
      const ip = event.candidate?.candidate?.match(
        /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/
      )?.[1];
      if (ip && !ip.startsWith("127.") && !ip.startsWith("0.")) {
        window.clearTimeout(timer);
        finish(ip);
      }
      if (!event.candidate) {
        window.clearTimeout(timer);
        finish("");
      }
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(""));
  });

  if (found) return originFromHost(found);
  return location.origin;
}

export function joinUrlFor(origin, code) {
  return new URL(`./join.html?room=${encodeURIComponent(code)}`, `${origin}/`).toString();
}

export function isLocalOrigin(origin) {
  try {
    return isLoopback(new URL(origin).hostname);
  } catch {
    return true;
  }
}
