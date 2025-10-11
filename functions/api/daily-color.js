// /functions/api/daily-color.js
export const onRequestGet = async ({ request, env }) => {
  // Block direct navigations (address-bar visits)
  const mode  = request.headers.get('Sec-Fetch-Mode');   // 'navigate' on URL bar
  const dest  = request.headers.get('Sec-Fetch-Dest');   // 'document' on URL bar
  const accept = request.headers.get('Accept') || '';

  if (mode === 'navigate' || dest === 'document' || accept.includes('text/html')) {
    return new Response('Not found', { status: 404 });
  }

  const secret = env.SECRET_SALT;
  if (!secret) return new Response('Missing SECRET_SALT', { status: 500 });

  // === HMAC(date, secret) → first 3 bytes → hex ===
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayStr = utcDate.toISOString().slice(0, 10);

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dayStr)));
  const [r,g,b] = [sig[0], sig[1], sig[2]];
  const hex = ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1).toUpperCase();

  const nextMidnight = new Date(utcDate.getTime() + 24*60*60*1000);
  const seconds = Math.max(1, Math.floor((nextMidnight - now) / 1000));

  return new Response(JSON.stringify({ hex }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${seconds}, s-maxage=${seconds}`,
    },
  });
};
