'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Database, Home, MapPin, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SeoulDongMap } from '@/components/seoul-dong-map';

type JeonseRow = { CGG_NM: string; STDG_NM: string; BLDG_USG: string; 평균전세가_만원: string; 거래건수: string };
type Transaction = {
  RCPT_YR: string; CGG_NM: string; STDG_NM: string; CTRT_DAY: string; RENT_SE: '전세' | '월세';
  RENT_AREA: number | string; GRFE: number | string; RTFE: number | string; BLDG_NM: string;
  FLR: number | string; BLDG_USG: string; CTRT_PRD: string; NEW_UPDT_YN: string;
};
type YearCount = { year: number; count: number; fetched: number; total: number };
type CitywideYear = { year: number; jeonseSum: number; jeonseCount: number; wolseSum: number; wolseCount: number; partial: boolean };
const homeTypes = ['아파트', '단독다가구', '연립다세대', '오피스텔'];

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

function formatContractDate(value: string) {
  return value?.length === 8 ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6)}` : value || '날짜 정보 없음';
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export default function HomePage() {
  const [rows, setRows] = useState<JeonseRow[]>([]);
  const [district, setDistrict] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [neighborhoodCode, setNeighborhoodCode] = useState<string | null>(null);
  const [homeType, setHomeType] = useState('all');
  const [periodMode, setPeriodMode] = useState('month');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [yearCounts, setYearCounts] = useState<YearCount[]>([]);
  const [citywideYears, setCitywideYears] = useState<CitywideYear[]>([]);
  const [loadingCitywide, setLoadingCitywide] = useState(true);
  const [citywideError, setCitywideError] = useState<string | null>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/jeonse_mean.csv').then((response) => { if (!response.ok) throw new Error('평균 데이터를 불러오지 못했습니다.'); return response.text(); })
      .then((csv) => setRows(parseCsv(csv))).catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const years = [new Date().getUTCFullYear() - 2, new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()];
    Promise.all(years.map(async (year) => {
      const response = await fetch(`/api/citywide?year=${year}`, { signal: controller.signal });
      const data = await response.json() as CitywideYear & { error?: string };
      if (!response.ok) throw new Error(data.error || '서울시 전체 평균을 불러오지 못했습니다.');
      return data;
    })).then(setCitywideYears)
      .catch((loadError: Error) => { if (loadError.name !== 'AbortError') setCitywideError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCitywide(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!district) return;
    const controller = new AbortController();
    setLoadingTransactions(true);
    setTransactionError(null);
    fetch(`/api/transactions?district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { rows?: Transaction[]; years?: YearCount[]; error?: string };
        if (!response.ok) throw new Error(data.error || '거래 내역을 불러오지 못했습니다.');
        return { rows: data.rows ?? [], years: data.years ?? [] };
      })
      .then((data) => { setTransactions(data.rows); setYearCounts(data.years); })
      .catch((loadError: Error) => { if (loadError.name !== 'AbortError') setTransactionError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingTransactions(false); });
    return () => controller.abort();
  }, [district]);

  const neighborhoods = useMemo(() => [...new Set(rows.filter((row) => row.CGG_NM === district).map((row) => row.STDG_NM))].sort((a, b) => a.localeCompare(b, 'ko')), [district, rows]);
  const districts = useMemo(() => [...new Set(rows.map((row) => row.CGG_NM))].sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const transactionTypes = ['전세', '월세'] as const;
  const allTypeTransactions = useMemo(() => transactions.filter((row) => !neighborhood || row.STDG_NM === neighborhood), [neighborhood, transactions]);
  const selectedTransactions = useMemo(() => homeType === 'all' ? allTypeTransactions : allTypeTransactions.filter((row) => row.BLDG_USG === homeType), [allTypeTransactions, homeType]);
  const pricesFor = (source: Transaction[], rentType: '전세' | '월세') => source.filter((row) => row.RENT_SE === rentType).map((row) => Number(rentType === '전세' ? row.GRFE : row.RTFE)).filter(Number.isFinite);
  const allJeonseValues = useMemo(() => pricesFor(allTypeTransactions, '전세'), [allTypeTransactions]);
  const allWolseValues = useMemo(() => pricesFor(allTypeTransactions, '월세'), [allTypeTransactions]);
  const selectedJeonseValues = useMemo(() => pricesFor(selectedTransactions, '전세'), [selectedTransactions]);
  const selectedWolseValues = useMemo(() => pricesFor(selectedTransactions, '월세'), [selectedTransactions]);
  const averageJeonse = average(selectedJeonseValues);
  const averageWolse = average(selectedWolseValues);
  const medianJeonse = median(selectedJeonseValues);
  const medianWolse = median(selectedWolseValues);
  const averageAllJeonse = average(allJeonseValues);
  const averageAllWolse = average(allWolseValues);
  const medianAllJeonse = median(allJeonseValues);
  const medianAllWolse = median(allWolseValues);
  const citywideAverages = useMemo(() => {
    const totals = citywideYears.reduce((sum, year) => ({
      jeonseSum: sum.jeonseSum + year.jeonseSum,
      jeonseCount: sum.jeonseCount + year.jeonseCount,
      wolseSum: sum.wolseSum + year.wolseSum,
      wolseCount: sum.wolseCount + year.wolseCount,
    }), { jeonseSum: 0, jeonseCount: 0, wolseSum: 0, wolseCount: 0 });
    return { jeonse: totals.jeonseCount ? totals.jeonseSum / totals.jeonseCount : null, wolse: totals.wolseCount ? totals.wolseSum / totals.wolseCount : null };
  }, [citywideYears]);
  const citywidePartial = citywideYears.some((year) => year.partial);
  const availableYears = useMemo(() => [...new Set(allTypeTransactions.map((row) => row.CTRT_DAY.slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort((a, b) => b.localeCompare(a)), [allTypeTransactions]);
  const availableMonths = useMemo(() => [...new Set(allTypeTransactions.map((row) => row.CTRT_DAY.slice(0, 6)).filter((month) => /^\d{6}$/.test(month)))].sort((a, b) => b.localeCompare(a)), [allTypeTransactions]);
  const effectiveYear = selectedYear && availableYears.includes(selectedYear) ? selectedYear : availableYears[0] ?? null;
  const effectiveMonth = selectedMonth && availableMonths.includes(selectedMonth) ? selectedMonth : availableMonths[0] ?? null;
  const periodTransactions = useMemo(() => allTypeTransactions.filter((row) => periodMode === 'month' ? row.CTRT_DAY.startsWith(effectiveMonth ?? '') : row.CTRT_DAY.startsWith(effectiveYear ?? '')), [allTypeTransactions, effectiveMonth, effectiveYear, periodMode]);
  const isPartialHistory = yearCounts.some((year) => year.total > year.fetched);
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
              <div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">서울 동 단위 지도</CardTitle><p className="mt-1 text-sm text-slate-500">지도를 확대해 동 경계를 누르면 해당 동의 거래를 확인할 수 있습니다.</p></div><MapPin className="mt-1 size-5 text-blue-600" aria-hidden="true" /></div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-5">
                <div>
                  <SeoulDongMap selectedDistrict={district} selectedDong={neighborhood} selectedDongCode={neighborhoodCode} districtFilter={district} onSelect={(selectedGu, selectedDong, dongCode) => { setDistrict(selectedGu); setNeighborhood(selectedDong); setNeighborhoodCode(dongCode); }} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>지도를 확대하고 이동한 뒤 동 경계를 누르세요.</span><span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-blue-600" />선택한 동</span></div>
                </div>
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="size-4 text-blue-600" aria-hidden="true" />구 선택</span>
                      <Select value={district} onValueChange={(value) => { setDistrict(value); setNeighborhood(null); setNeighborhoodCode(null); }}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue placeholder="서울 자치구를 선택하세요" /></SelectTrigger><SelectContent className="max-h-72">{districts.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="size-4 text-blue-600" aria-hidden="true" />동 선택</span>
                      <Select value={neighborhood} onValueChange={(value) => { setNeighborhood(value); setNeighborhoodCode(null); }} disabled={!district}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue placeholder={district ? '동을 선택하세요' : '구를 먼저 선택하세요'} /></SelectTrigger><SelectContent className="max-h-72">{neighborhoods.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
                    </div>
                  </div>
                  <div><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="size-4 text-blue-600" aria-hidden="true" />주택유형</span>
                    <Tabs value={homeType} onValueChange={setHomeType}>
                      <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 overflow-hidden rounded-xl bg-slate-100 p-1 sm:grid-cols-3">
                        <TabsTrigger value="all" className="min-w-0 overflow-hidden rounded-lg px-1.5 py-2 text-xs leading-tight">모든 유형</TabsTrigger>
                        {homeTypes.map((type) => <TabsTrigger key={type} value={type} className="min-w-0 overflow-hidden rounded-lg px-1.5 py-2 text-xs leading-tight">{type}</TabsTrigger>)}
                      </TabsList>
                    </Tabs>
                  </div>
                  {district && <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">선택 지역 <span className="ml-2 text-blue-600">{district}{neighborhood ? ` · ${neighborhood}` : ''}</span></p>}
                  {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-blue-100 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-lg">평균 전월세 금액</CardTitle><p className="text-sm text-slate-500">선택한 동의 최근 3년 공개 계약 기준 · 단위 만원</p></CardHeader>
              <CardContent className="px-6 py-5" aria-live="polite">
                <section className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">서울시 전체 평균 · 최근 3년</h3>
                  {loadingCitywide ? <p className="text-sm text-slate-500">서울시 평균을 계산하고 있습니다…</p> : citywideError ? <p className="text-sm text-rose-600">{citywideError}</p> : <>
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-slate-500">평균 전세 보증금</p><p className="mt-1 text-lg font-bold text-blue-700">{citywideAverages.jeonse === null ? '자료 없음' : formatPrice(citywideAverages.jeonse)}</p></div><div className="rounded-xl bg-white p-3"><p className="text-xs font-semibold text-slate-500">평균 월세</p><p className="mt-1 text-lg font-bold text-emerald-700">{citywideAverages.wolse === null ? '자료 없음' : `${formatPrice(citywideAverages.wolse)} /월`}</p></div></div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">서울 25개 구의 API 조회 계약 합산 기준입니다.{citywidePartial ? ' 일부 구는 API 조회 한도에 따른 일부 계약만 포함됩니다.' : ''}</p>
                  </>}
                </section>
                {!district || !neighborhood ? <p className="py-5 text-sm leading-6 text-slate-500">구와 동을 선택하면 해당 동의 평균과 중위값을 보여드립니다.</p> : loadingTransactions ? <p className="py-5 text-sm text-slate-500">평균 금액을 계산하고 있습니다…</p> : transactionError ? <p className="py-5 text-sm font-medium text-rose-600">{transactionError}</p> : <>
                  {homeType !== 'all' && <section className="mb-5 rounded-2xl border border-slate-200 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-700">모든 유형 평균 · {district} {neighborhood}</h3>
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-semibold text-slate-500">평균 전세 보증금</p><p className="mt-1 text-lg font-bold text-blue-700">{averageAllJeonse === null ? '자료 없음' : formatPrice(averageAllJeonse)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-slate-500">평균 월세</p><p className="mt-1 text-lg font-bold text-emerald-700">{averageAllWolse === null ? '자료 없음' : `${formatPrice(averageAllWolse)} /월`}</p></div></div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600"><p>전세 중위값 <strong className="ml-1 text-slate-800">{medianAllJeonse === null ? '자료 없음' : formatPrice(medianAllJeonse)}</strong></p><p>월세 중위값 <strong className="ml-1 text-slate-800">{medianAllWolse === null ? '자료 없음' : `${formatPrice(medianAllWolse)} /월`}</strong></p></div>
                  </section>}
                  <p className="mb-3 text-sm font-semibold text-blue-700">{district} · {neighborhood} · {homeType === 'all' ? '모든 유형' : homeType}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-semibold text-slate-500">평균 전세 보증금</p><p className="mt-2 text-xl font-bold tracking-tight text-blue-700 sm:text-2xl">{averageJeonse === null ? '자료 없음' : formatPrice(averageJeonse)}</p></div>
                    <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-slate-500">평균 월세</p><p className="mt-2 text-xl font-bold tracking-tight text-emerald-700 sm:text-2xl">{averageWolse === null ? '자료 없음' : `${formatPrice(averageWolse)} /월`}</p></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">전세 중위값</p><p className="mt-1 text-sm font-bold text-slate-800">{medianJeonse === null ? '자료 없음' : formatPrice(medianJeonse)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">월세 중위값</p><p className="mt-1 text-sm font-bold text-slate-800">{medianWolse === null ? '자료 없음' : `${formatPrice(medianWolse)} /월`}</p></div></div>
                  <p className="mt-3 text-xs text-slate-500">전세는 보증금, 월세는 월 임대료 평균입니다. 조회 계약 {selectedTransactions.length.toLocaleString()}건 기준</p>
                  {isPartialHistory && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">일부 연도는 API 조회 한도(연도별 1,000건)까지의 계약으로 평균을 계산했습니다.</p>}
                </>}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-slate-100 px-6 py-5"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">최근 전월세 거래</CardTitle><p className="mt-1 text-sm text-slate-500">{neighborhood ? `${neighborhood} · ` : ''}{homeType === 'all' ? '모든 유형' : homeType} · 최근 3년</p></div><Search className="mt-1 size-5 text-blue-600" aria-hidden="true" /></div></CardHeader>
              <CardContent className="px-0 py-0">
                {!district || !neighborhood ? <div className="grid min-h-48 place-items-center px-6 text-center text-sm leading-6 text-slate-500">구와 동을 선택하면<br />해당 지역의 전월세 계약 내역을 불러옵니다.</div> : loadingTransactions ? <div className="grid min-h-48 place-items-center text-sm text-slate-500">실거래 내역을 불러오는 중입니다…</div> : transactionError ? <div className="m-5 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{transactionError}</div> : <>
                  <div className="border-b border-slate-100 px-4 py-3">
                    <Tabs value={periodMode} onValueChange={setPeriodMode}>
                      <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-slate-100 p-1"><TabsTrigger value="month" className="rounded-lg">월별</TabsTrigger><TabsTrigger value="year" className="rounded-lg">연도별</TabsTrigger></TabsList>
                      <TabsContent value="month" className="mt-3"><div className="flex gap-2 overflow-x-auto pb-1">{availableMonths.map((month) => <button key={month} type="button" onClick={() => setSelectedMonth(month)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${effectiveMonth === month ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{month.slice(0, 4)}년 {Number(month.slice(4, 6))}월</button>)}</div></TabsContent>
                      <TabsContent value="year" className="mt-3"><div className="flex gap-2 overflow-x-auto pb-1">{availableYears.map((year) => <button key={year} type="button" onClick={() => setSelectedYear(year)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${effectiveYear === year ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{year}년</button>)}</div></TabsContent>
                    </Tabs>
                    <p className="mt-2 text-xs font-medium text-slate-500">{periodMode === 'month' && effectiveMonth ? `${effectiveMonth.slice(0, 4)}년 ${Number(effectiveMonth.slice(4, 6))}월` : effectiveYear ? `${effectiveYear}년 전체` : '거래 자료 없음'} · 최신 계약 순</p>
                  </div>
                  <div className="max-h-[510px] overflow-auto">
                  {transactionTypes.map((type) => {
                    const filtered = periodTransactions.filter((row) => row.RENT_SE === type && (homeType === 'all' || row.BLDG_USG === homeType)).sort((a, b) => b.CTRT_DAY.localeCompare(a.CTRT_DAY));
                    const grouped = [...new Set(filtered.map((row) => row.CTRT_DAY.slice(0, 6)))].sort((a, b) => b.localeCompare(a));
                    return <section key={type} className="border-b border-slate-100 last:border-0">
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-50 px-5 py-3"><h3 className="text-sm font-bold text-slate-800">{type}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">조회 {filtered.length}건</span></div>
                      {filtered.length ? grouped.map((month) => <div key={`${type}-${month}`}><h4 className="sticky top-11 z-[5] border-y border-slate-100 bg-white px-5 py-2 text-xs font-bold text-slate-500">{month.slice(0, 4)}년 {Number(month.slice(4, 6))}월</h4><ul className="divide-y divide-slate-100">{filtered.filter((row) => row.CTRT_DAY.startsWith(month)).map((row, index) => <li key={`${row.CTRT_DAY}-${row.STDG_NM}-${row.BLDG_NM}-${index}`} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{row.BLDG_NM || row.STDG_NM} <span className="font-normal text-slate-500">· {row.STDG_NM}</span></p><p className="mt-1 text-xs text-slate-500">{formatContractDate(row.CTRT_DAY)} · {row.BLDG_USG} · {row.RENT_AREA}㎡{row.FLR ? ` · ${row.FLR}층` : ''}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-blue-700">보증금 {formatPrice(Number(row.GRFE))}</p>{type === '월세' && <p className="mt-1 text-xs font-medium text-slate-600">월 {formatPrice(Number(row.RTFE))}</p>}</div></div>
                        {row.CTRT_PRD && <p className="mt-2 text-xs text-slate-400">계약 {row.CTRT_PRD}{row.NEW_UPDT_YN ? ` · ${row.NEW_UPDT_YN}` : ''}</p>}
                      </li>)}</ul></div>) : <p className="px-5 py-6 text-sm text-slate-500">선택 기간에 {type} 거래 내역이 없습니다.</p>}
                    </section>;
                  })}
                  <p className="flex items-center gap-2 px-5 py-4 text-xs leading-5 text-slate-400"><Database className="size-3.5 shrink-0" />선택한 기간의 거래를 월별·최신순으로 표시합니다. 출처: 서울 열린데이터광장</p>
                  </div>
                </>}
              </CardContent>
            </Card>
          </div>
        </section>
        <p className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">평균은 최근 3개 접수연도 API 조회분 기준이며 단위는 만원입니다. API는 연도별 최대 1,000건을 반환합니다. 계약 자료는 서울시 열린데이터광장, 동 경계는 southkorea/seoul-maps (JUSO 2015) 자료를 사용합니다.</p>
      </div>
    </main>
  );
}
