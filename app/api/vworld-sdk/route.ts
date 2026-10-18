import { env } from 'cloudflare:workers';

export async function GET(request: Request) {
  const apiKey = (env as unknown as Record<string, string | undefined>).VWORLD_API_KEY;
  if (!apiKey) return new Response('VWorld map is not configured', { status: 503 });

  const sdkUrl = new URL('https://map.vworld.kr/js/vworldMapInit.js.do');
  sdkUrl.searchParams.set('apiKey', apiKey);
  sdkUrl.searchParams.set('version', '2.0');
  sdkUrl.searchParams.set('domain', new URL(request.url).host);

  try {
    const response = await fetch(sdkUrl, { headers: { Referer: `${new URL(request.url).origin}/` } });
    if (!response.ok) return new Response('VWorld map SDK could not be loaded', { status: 502 });
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('VWorld map SDK could not be loaded', { status: 502 });
  }
}
