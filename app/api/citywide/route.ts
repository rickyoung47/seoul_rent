import { env } from 'cloudflare:workers';

const districtCodes: Record<string, string> = {
  종로구: '11110', 중구: '11140', 용산구: '11170', 성동구: '11200', 광진구: '11215',
  동대문구: '11230', 중랑구: '11260', 성북구: '11290', 강북구: '11305', 도봉구: '11320',
  노원구: '11350', 은평구: '11380', 서대문구: '11410', 마포구: '11440', 양천구: '11470',
  강서구: '11500', 구로구: '11530', 금천구: '11545', 영등포구: '11560', 동작구: '11590',
  관악구: '11620', 서초구: '11650', 강남구: '11680', 송파구: '11710', 강동구: '11740',
};

type RentRow = { CGG_NM: string; RCPT_YR: string; RENT_SE: string; GRFE: string; RTFE: string };
type ApiPayload = { tbLnOpendataRentV?: { list_total_count?: number | string; RESULT?: { CODE?: string; MESSAGE?: string }; row?: RentRow[] } };

export async function GET(request: Request) {
  const year = new URL(request.url).searchParams.get('year') ?? '';
  const allowedYears = [new Date().getUTCFullYear() - 2, new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()].map(String);
  if (!allowedYears.includes(year)) return Response.json({ error: '조회할 연도를 확인해 주세요.' }, { status: 400 });

  const apiKey = (env as unknown as Record<string, string | undefined>).SEOUL_API_KEY;
  if (!apiKey) return Response.json({ error: '거래 내역 API 키가 설정되지 않았습니다.' }, { status: 503 });

  try {
    const districtResults = await Promise.all(Object.entries(districtCodes).map(async ([district, code]) => {
      const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/tbLnOpendataRentV/1/1000/${year}/${code}/`);
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit);
      if (!response.ok) throw new Error(`${district} 거래 자료 조회에 실패했습니다.`);
      const result = (await response.json() as ApiPayload).tbLnOpendataRentV;
      if (result?.RESULT && result.RESULT.CODE !== 'INFO-000') throw new Error(result.RESULT.MESSAGE || `${district} 거래 자료 조회에 실패했습니다.`);
      const rows = (result?.row ?? []).filter((row) => row.CGG_NM === district && row.RCPT_YR === year);
      return { rows, fetched: rows.length, total: Number(result?.list_total_count ?? rows.length) };
    }));

    const totals = districtResults.flatMap(({ rows }) => rows).reduce((sum, row) => {
      const amount = Number(row.RENT_SE === '전세' ? row.GRFE : row.RENT_SE === '월세' ? row.RTFE : NaN);
      if (!Number.isFinite(amount)) return sum;
      if (row.RENT_SE === '전세') { sum.jeonseSum += amount; sum.jeonseCount += 1; }
      else if (row.RENT_SE === '월세') { sum.wolseSum += amount; sum.wolseCount += 1; }
      return sum;
    }, { jeonseSum: 0, jeonseCount: 0, wolseSum: 0, wolseCount: 0 });
    const partial = districtResults.some(({ fetched, total }) => total > fetched);
    return Response.json({ year: Number(year), ...totals, partial }, { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '서울시 전체 평균 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
