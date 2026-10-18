import { env } from 'cloudflare:workers';

const districts = new Set([
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구',
  '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구',
  '용산구', '은평구', '종로구', '중구', '중랑구',
]);
const homeTypes = new Set(['아파트', '단독다가구', '연립다세대', '오피스텔']);

type SeoulTransaction = {
  RCPT_YR: string; CGG_NM: string; STDG_NM: string; CTRT_DAY: string; RENT_SE: string;
  RENT_AREA: number; GRFE: string; RTFE: string; BLDG_NM: string; FLR: number;
  BLDG_USG: string; CTRT_PRD: string; NEW_UPDT_YN: string;
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

  const apiUrl = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/tbLnOpendataRentV/1/1000/`);
  apiUrl.searchParams.set('CGG_NM', district);
  apiUrl.searchParams.set('BLDG_USG', homeType);

  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit);
    if (!response.ok) throw new Error('서울시 데이터 서버에 연결하지 못했습니다.');
    const payload = await response.json() as {
      tbLnOpendataRentV?: { RESULT?: { CODE?: string; MESSAGE?: string }; row?: SeoulTransaction[] };
    };
    const result = payload.tbLnOpendataRentV;
    if (result?.RESULT && result.RESULT.CODE !== 'INFO-000') throw new Error(result.RESULT.MESSAGE || '서울시 데이터 조회에 실패했습니다.');
    const rows = (result?.row ?? []).filter((row) => row.CGG_NM === district && row.BLDG_USG === homeType);
    return Response.json({ rows }, { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '거래 내역 조회 중 오류가 발생했습니다.' }, { status: 502 });
  }
}
