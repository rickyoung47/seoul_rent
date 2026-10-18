import { env } from 'cloudflare:workers';

const MAX_ZOOM = 18;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const z = Number(searchParams.get('z'));
  const x = Number(searchParams.get('x'));
  const y = Number(searchParams.get('y'));
  const tileCount = 2 ** z;

  if (!Number.isInteger(z) || z < 1 || z > MAX_ZOOM || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
    return new Response('Invalid tile coordinates', { status: 400 });
  }

  const apiKey = (env as unknown as Record<string, string | undefined>).VWORLD_API_KEY;
  if (!apiKey) return new Response('Map service is not configured', { status: 503 });

  const upstream = new URL(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(apiKey)}/Base/${z}/${y}/${x}.png`);
  try {
    const response = await fetch(upstream, {
      headers: { Referer: `${new URL(request.url).origin}/` },
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return new Response('Map tile service unavailable', { status: 502 });
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Map tile service unavailable', { status: 502 });
  }
}
