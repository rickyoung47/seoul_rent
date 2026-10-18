import { env } from 'cloudflare:workers';

const districts = new Set([
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구',
  '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구',
  '용산구', '은평구', '종로구', '중구', '중랑구',
]);
const homeTypes = new Set(['아파트', '단독다가구', '연립다세대', '오피스텔']);
const districtCodes: Record<string, string> = {
  종로구: '11110', 중구: '11140', 용산구: '11170', 성동구: '11200', 광진구: '11215',
  동대문구: '11230', 중랑구: '11260', 성북구: '11290', 강북구: '11305', 도봉구: '11320',
  노원구: '11350', 은평구: '11380', 서대문구: '11410', 마포구: '11440', 양천구: '11470',
  강서구: '11500', 구로구: '11530', 금천구: '11545', 영등포구: '11560', 동작구: '11590',
  관악구: '11620', 서초구: '11650', 강남구: '11680', 송파구: '11710', 강동구: '11740',
};

type SeoulTransaction = {
  RCPT_YR: string; CGG_NM: string; STDG_NM: string; CTRT_DAY: string; RENT_SE: string;
  RENT_AREA: number; GRFE: string; RTFE: string; BLDG_NM: string; FLR: number;
  BLDG_USG: string; CTRT_PRD: string; NEW_UPDT_YN: string;
};
type SeoulApiResponse = {
  tbLnOpendataRentV?: {
    list_total_count?: number | string;
    RESULT?: { CODE?: string; MESSAGE?: string };
    row?: SeoulTransaction[];
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district') ?? '';
  const homeType = searchParams.get('homeType') ?? '';

  if (!districts.has(district) || !homeTypes.has(homeType)) {
    return Response.json({ error: '구와 주택유형을 다시 선택해 주세요.' }, { status: 400 });
  }

  const apiKey = (env as unknown as Record<string, string | undefined>).SEOUL_API_KEY;
  if (!apiKey) return Response.json({ error: '거래 내역 API 키가 설정되지 않았습니다.' }, { status: 503 });

  const years = [new Date().getUTCFullYear() - 2, new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()];
  try {
    const results = await Promise.all(years.map(async (year) => {
      const apiUrl = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/tbLnOpendataRentV/1/1000/${year}/${districtCodes[district]}/`);

      const response = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit);
      if (!response.ok) throw new Error('서울시 데이터 서버에 연결하지 못했습니다.');
      const payload = await response.json() as SeoulApiResponse;
      const result = payload.tbLnOpendataRentV;
      if (result?.RESULT && result.RESULT.CODE !== 'INFO-000') throw new Error(result.RESULT.MESSAGE || `${year}년 자료 조회에 실패했습니다.`);
      const fetchedRows = (result?.row ?? []).filter((row) => row.CGG_NM === district && row.RCPT_YR === String(year));
      const rows = fetchedRows.filter((row) => row.BLDG_USG === homeType);
      return { year, rows, fetched: fetchedRows.length, total: Number(result?.list_total_count ?? fetchedRows.length) };
    }));

    const rows = results.flatMap(({ rows }) => rows);
    const yearsSummary = results.map(({ year, rows, fetched, total }) => ({ year, count: rows.length, fetched, total }));
    return Response.json(
      { rows, years: yearsSummary },
      { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '거래 내역 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
