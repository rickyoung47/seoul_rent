'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Database, Home, MapPin, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type JeonseRow = { CGG_NM: string; STDG_NM: string; BLDG_USG: string; 평균전세가_만원: string; 거래건수: string };
type Transaction = {
  RCPT_YR: string; CGG_NM: string; STDG_NM: string; CTRT_DAY: string; RENT_SE: '전세' | '월세';
  RENT_AREA: number | string; GRFE: number | string; RTFE: number | string; BLDG_NM: string;
  FLR: number | string; BLDG_USG: string; CTRT_PRD: string; NEW_UPDT_YN: string;
};
type YearCount = { year: number; count: number; fetched: number; total: number };
type AnnualAverage = { year: number; jeonse: number | null; wolse: number | null; jeonseCount: number; wolseCount: number };
type DistrictFeature = { type: 'Feature'; properties: { SIG_KOR_NM: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][][] | number[][][] } };
type DistrictCollection = { type: 'FeatureCollection'; features: DistrictFeature[] };

const homeTypes = ['아파트', '단독다가구', '연립다세대', '오피스텔'];
const mapWidth = 560;
const mapHeight = 500;

function parseCsv(text: string): JeonseRow[] {
  const [header, ...lines] = text.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(keys.map((key, index) => [key, line.split(',')[index]])) as JeonseRow);
}

function formatPrice(value: number) {
  const rounded = Math.round(value);
  const eok = Math.floor(rounded / 10000);
  const man = rounded % 10000;
  if (eok === 0) return `${man.toLocaleString()}만원`;
  return man === 0 ? `${eok}억원` : `${eok}억 ${man.toLocaleString()}만원`;
}

function coordinateRings(feature: DistrictFeature): number[][][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][];
}

function geometryPoints(feature: DistrictFeature) {
  return coordinateRings(feature).flat(2);
}

function projectPoint([longitude, latitude]: number[], bounds: [number, number, number, number]) {
  const [minX, minY, maxX, maxY] = bounds;
  const padding = 18;
  return [padding + ((longitude - minX) / (maxX - minX)) * (mapWidth - padding * 2), mapHeight - padding - ((latitude - minY) / (maxY - minY)) * (mapHeight - padding * 2)] as const;
}

function featurePath(feature: DistrictFeature, bounds: [number, number, number, number]) {
  return coordinateRings(feature).map((polygon) => polygon.map((ring) => ring.map((point, index) => {
    const [x, y] = projectPoint(point, bounds);
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z').join(' ')).join(' ');
}

function featureCenter(feature: DistrictFeature, bounds: [number, number, number, number]) {
  const points = geometryPoints(feature);
  const mean = points.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
  return projectPoint([mean[0] / points.length, mean[1] / points.length], bounds);
}

function formatContractDate(value: string) {
  return value?.length === 8 ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6)}` : value || '날짜 정보 없음';
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function PriceTrendChart({ title, data, field, color }: { title: string; data: AnnualAverage[]; field: 'jeonse' | 'wolse'; color: string }) {
  const values = data.map((item) => item[field]).filter((value): value is number => value !== null);
  const max = Math.max(1, ...values);
  const baseline = 174;
  const chartHeight = 122;
  return <Card className="border-slate-200 bg-white py-0 shadow-sm">
    <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-lg">{title}</CardTitle><p className="text-sm text-slate-500">연도별 평균 · 금액 단위 만원</p></CardHeader>
    <CardContent className="px-4 py-5 sm:px-6">
      {data.some((item) => item[field] !== null) ? <svg viewBox="0 0 600 230" className="block h-auto w-full" role="img" aria-label={title}>
        <title>{title}</title>
        <line x1="40" y1={baseline} x2="560" y2={baseline} stroke="#cbd5e1" strokeWidth="1" />
        {data.map((item, index) => {
          const value = item[field];
          const height = value === null ? 0 : Math.max(4, (value / max) * chartHeight);
          const x = 116 + index * 184;
          const y = baseline - height;
          const count = field === 'jeonse' ? item.jeonseCount : item.wolseCount;
          return <g key={item.year}>
            {value !== null && <><rect x={x} y={y} width="68" height={height} rx="10" fill={color} /><text x={x + 34} y={Math.max(24, y - 10)} textAnchor="middle" className="fill-slate-700 text-[12px] font-semibold">{Math.round(value).toLocaleString()}</text></>}
            <text x={x + 34} y="198" textAnchor="middle" className="fill-slate-800 text-[13px] font-bold">{item.year}년</text>
            <text x={x + 34} y="218" textAnchor="middle" className="fill-slate-400 text-[10px]">{count.toLocaleString()}건 기준</text>
          </g>;
        })}
      </svg> : <div className="grid h-48 place-items-center text-sm text-slate-500">표시할 거래 데이터가 없습니다.</div>}
    </CardContent>
  </Card>;
}

export default function HomePage() {
  const [rows, setRows] = useState<JeonseRow[]>([]);
  const [districts, setDistricts] = useState<DistrictCollection | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [homeType, setHomeType] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearCounts, setYearCounts] = useState<YearCount[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/jeonse_mean.csv').then((response) => { if (!response.ok) throw new Error('평균 데이터를 불러오지 못했습니다.'); return response.text(); }),
      fetch('/seoul-districts.geo.json').then((response) => { if (!response.ok) throw new Error('지도 데이터를 불러오지 못했습니다.'); return response.json() as Promise<DistrictCollection>; }),
    ]).then(([csv, map]) => { setRows(parseCsv(csv)); setDistricts(map); }).catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!district || !homeType) return;
    const controller = new AbortController();
    setLoadingTransactions(true);
    setTransactionError(null);
    fetch(`/api/transactions?district=${encodeURIComponent(district)}&homeType=${encodeURIComponent(homeType)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { rows?: Transaction[]; years?: YearCount[]; error?: string };
        if (!response.ok) throw new Error(data.error || '거래 내역을 불러오지 못했습니다.');
        return { rows: data.rows ?? [], years: data.years ?? [] };
      })
      .then((data) => { setTransactions(data.rows); setYearCounts(data.years); })
      .catch((loadError: Error) => { if (loadError.name !== 'AbortError') setTransactionError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingTransactions(false); });
    return () => controller.abort();
  }, [district, homeType]);

  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (!districts?.features.length) return null;
    const points = districts.features.flatMap(geometryPoints);
    return [Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1])), Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))];
  }, [districts]);
  const neighborhoods = useMemo(() => [...new Set(rows.filter((row) => row.CGG_NM === district).map((row) => row.STDG_NM))].sort((a, b) => a.localeCompare(b, 'ko')), [district, rows]);
  const transactionTypes = ['전세', '월세'] as const;
  const selectedTransactions = useMemo(() => transactions.filter((row) => !neighborhood || row.STDG_NM === neighborhood), [neighborhood, transactions]);
  const averageJeonse = useMemo(() => average(selectedTransactions.filter((row) => row.RENT_SE === '전세').map((row) => Number(row.GRFE)).filter(Number.isFinite)), [selectedTransactions]);
  const averageWolse = useMemo(() => average(selectedTransactions.filter((row) => row.RENT_SE === '월세').map((row) => Number(row.RTFE)).filter(Number.isFinite)), [selectedTransactions]);
  const annualAverages = useMemo<AnnualAverage[]>(() => yearCounts.map(({ year }) => {
    const yearRows = selectedTransactions.filter((row) => row.RCPT_YR === String(year));
    const jeonse = yearRows.filter((row) => row.RENT_SE === '전세').map((row) => Number(row.GRFE)).filter(Number.isFinite);
    const wolse = yearRows.filter((row) => row.RENT_SE === '월세').map((row) => Number(row.RTFE)).filter(Number.isFinite);
    return { year, jeonse: average(jeonse), wolse: average(wolse), jeonseCount: jeonse.length, wolseCount: wolse.length };
  }), [selectedTransactions, yearCounts]);
  const isPartialHistory = yearCounts.some((year) => year.total > year.fetched);
  const transactionCountByDistrict = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => { acc[row.CGG_NM] = (acc[row.CGG_NM] || 0) + Number(row.거래건수 || 0); return acc; }, {}), [rows]);
  const maxDistrictCount = Math.max(1, ...Object.values(transactionCountByDistrict));

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-9 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200"><Home className="size-5" aria-hidden="true" /></span>
          <div><p className="text-xs font-bold tracking-[0.16em] text-blue-600">SEOUL RENT CHECK</p><h1 className="text-xl font-bold tracking-tight sm:text-2xl">서울 전월세 확인</h1></div>
        </header>

        <section className="grid gap-7 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <CardHeader className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">서울 자치구 지도</CardTitle><p className="mt-1 text-sm text-slate-500">지도를 눌러 거래를 확인할 지역을 선택하세요.</p></div><MapPin className="mt-1 size-5 text-blue-600" aria-hidden="true" /></div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="overflow-hidden rounded-2xl bg-[#f2f6fb]">
                {districts && bounds ? <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="mx-auto block h-auto w-full max-w-[590px]" aria-label="서울시 자치구 선택 지도"><title>서울시 자치구 선택 지도</title>
                  {districts.features.map((feature) => {
                    const name = feature.properties.SIG_KOR_NM;
                    const [x, y] = featureCenter(feature, bounds);
                    const count = transactionCountByDistrict[name] || 0;
                    const opacity = 0.22 + (count / maxDistrictCount) * 0.42;
                    return <g key={name} className="cursor-pointer outline-none" role="button" tabIndex={0} aria-label={`${name} 선택`} aria-pressed={district === name} onClick={() => { setDistrict(name); setNeighborhood(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDistrict(name); setNeighborhood(null); } }}>
                      <path d={featurePath(feature, bounds)} fill={district === name ? '#2563eb' : `rgba(59, 130, 246, ${opacity})`} stroke="white" strokeWidth="1.4" className="transition-colors hover:fill-blue-500 focus-visible:stroke-slate-900" />
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className={`pointer-events-none select-none text-[9px] font-semibold sm:text-[10px] ${district === name ? 'fill-white' : 'fill-slate-800'}`}>{name.replace('구', '')}</text>
                    </g>;
                  })}
                </svg> : <div className="grid h-72 place-items-center text-sm text-slate-500">{error || '지도를 불러오는 중입니다.'}</div>}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>색이 진할수록 기존 요약 데이터의 거래 건수가 많습니다.</span><span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-blue-600" />선택한 구</span></div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="size-4 text-blue-600" aria-hidden="true" />동 선택</span>
                  <Select value={neighborhood} onValueChange={setNeighborhood} disabled={!district}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue placeholder={district ? '동을 선택하세요' : '먼저 지도에서 구를 선택하세요'} /></SelectTrigger><SelectContent className="max-h-72">{neighborhoods.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="size-4 text-blue-600" aria-hidden="true" />주택유형</span>
                  <Select value={homeType} onValueChange={setHomeType}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue placeholder="주택유형을 선택하세요" /></SelectTrigger><SelectContent>{homeTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              {district && <div className="mt-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3"><p className="text-sm font-semibold text-blue-800">선택 지역 <span className="ml-2 text-blue-600">{district}{neighborhood ? ` · ${neighborhood}` : ''}</span></p><button type="button" className="text-xs font-semibold text-blue-600 hover:text-blue-800" onClick={() => { setDistrict(null); setNeighborhood(null); }}>지역 변경</button></div>}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-blue-100 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-lg">평균 전월세 금액</CardTitle><p className="text-sm text-slate-500">선택한 지역 · 주택유형의 최근 3년 공개 계약 기준</p></CardHeader>
              <CardContent className="px-6 py-5" aria-live="polite">
                {!district || !homeType ? <p className="py-5 text-sm leading-6 text-slate-500">지도에서 구를 고르고 동과 주택유형을 선택하세요.</p> : loadingTransactions ? <p className="py-5 text-sm text-slate-500">평균 금액을 계산하고 있습니다…</p> : transactionError ? <p className="py-5 text-sm font-medium text-rose-600">{transactionError}</p> : <>
                  <p className="mb-4 text-sm font-semibold text-blue-700">{district}{neighborhood ? ` · ${neighborhood}` : ''} · {homeType}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold text-slate-500">평균 전세 보증금</p><p className="mt-2 text-xl font-bold tracking-tight text-blue-700 sm:text-2xl">{averageJeonse === null ? '자료 없음' : formatPrice(averageJeonse)}</p></div>
                    <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-slate-500">평균 월세</p><p className="mt-2 text-xl font-bold tracking-tight text-emerald-700 sm:text-2xl">{averageWolse === null ? '자료 없음' : `${formatPrice(averageWolse)} /월`}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">전세는 보증금, 월세는 월 임대료 평균입니다. 조회 계약 {selectedTransactions.length.toLocaleString()}건 기준</p>
                  {isPartialHistory && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">일부 연도는 API 조회 한도(연도별 1,000건)까지의 계약으로 평균을 계산했습니다.</p>}
                </>}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 px-6 py-5"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">최근 전월세 거래</CardTitle><p className="mt-1 text-sm text-slate-500">서울시 공개 데이터의 최근 3년 계약 내역</p></div><Search className="mt-1 size-5 text-blue-600" aria-hidden="true" /></div></CardHeader>
              <CardContent className="px-0 py-0">
                {!district || !homeType ? <div className="grid min-h-48 place-items-center px-6 text-center text-sm leading-6 text-slate-500">지도에서 구를 선택하고 주택유형을 고르면<br />전세와 월세 계약 내역을 불러옵니다.</div> : loadingTransactions ? <div className="grid min-h-48 place-items-center text-sm text-slate-500">실거래 내역을 불러오는 중입니다…</div> : transactionError ? <div className="m-5 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{transactionError}</div> : <div className="max-h-[510px] overflow-auto">
                  {transactionTypes.map((type) => {
                    const filtered = selectedTransactions.filter((row) => row.RENT_SE === type).sort((a, b) => b.CTRT_DAY.localeCompare(a.CTRT_DAY));
                    return <section key={type} className="border-b border-slate-100 last:border-0">
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-50 px-5 py-3"><h3 className="text-sm font-bold text-slate-800">{type}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">조회 {filtered.length}건</span></div>
                      {filtered.length ? <ul className="divide-y divide-slate-100">{filtered.slice(0, 30).map((row, index) => <li key={`${row.CTRT_DAY}-${row.STDG_NM}-${row.BLDG_NM}-${index}`} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{row.BLDG_NM || row.STDG_NM} <span className="font-normal text-slate-500">· {row.STDG_NM}</span></p><p className="mt-1 text-xs text-slate-500">{formatContractDate(row.CTRT_DAY)} · {row.BLDG_USG} · {row.RENT_AREA}㎡{row.FLR ? ` · ${row.FLR}층` : ''}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-blue-700">보증금 {formatPrice(Number(row.GRFE))}</p>{type === '월세' && <p className="mt-1 text-xs font-medium text-slate-600">월 {formatPrice(Number(row.RTFE))}</p>}</div></div>
                        {row.CTRT_PRD && <p className="mt-2 text-xs text-slate-400">계약 {row.CTRT_PRD}{row.NEW_UPDT_YN ? ` · ${row.NEW_UPDT_YN}` : ''}</p>}
                      </li>)}</ul> : <p className="px-5 py-6 text-sm text-slate-500">{neighborhood ? `${neighborhood}의 ${type} 거래 내역이 없습니다.` : `최근 공개 자료에 ${type} 거래가 없습니다.`}</p>}
                    </section>;
                  })}
                  <p className="flex items-center gap-2 px-5 py-4 text-xs leading-5 text-slate-400"><Database className="size-3.5 shrink-0" />각 유형별 최신 30건까지 표시합니다. 출처: 서울 열린데이터광장</p>
                </div>}
              </CardContent>
            </Card>
          </div>
        </section>
        <section className="mt-7 grid gap-6 lg:grid-cols-2">
          <PriceTrendChart title="지난 3년 전세 보증금 평균" data={!district || !homeType || loadingTransactions || transactionError ? [] : annualAverages} field="jeonse" color="#2563eb" />
          <PriceTrendChart title="지난 3년 월세 평균" data={!district || !homeType || loadingTransactions || transactionError ? [] : annualAverages} field="wolse" color="#059669" />
        </section>
        <p className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">평균은 최근 3개 접수연도 API 조회분 기준이며 단위는 만원입니다. API는 연도별 최대 1,000건을 반환합니다. 계약 자료는 서울시 열린데이터광장, 지도 경계는 southkorea/seoul-maps 자료를 사용합니다.</p>
      </div>
    </main>
  );
}
