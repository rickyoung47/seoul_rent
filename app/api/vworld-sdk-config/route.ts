import { env } from 'cloudflare:workers';

export async function GET(request: Request) {
  const apiKey = (env as unknown as Record<string, string | undefined>).VWORLD_API_KEY;
  if (!apiKey) return Response.json({ error: 'VWorld 지도 키가 설정되지 않았습니다.' }, { status: 503 });

  const sdkUrl = new URL('https://map.vworld.kr/js/vworldMapInit.js.do');
  sdkUrl.searchParams.set('version', '2.0');
  sdkUrl.searchParams.set('apiKey', apiKey);
  sdkUrl.searchParams.set('domain', new URL(request.url).host);
  return Response.json({ scriptUrl: sdkUrl.toString() }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
