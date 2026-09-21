'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Database, Home, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type JeonseRow = { CGG_NM: string; STDG_NM: string; BLDG_USG: string; 평균전세가_만원: string; 거래건수: string };
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

export default function HomePage() {
  const [rows, setRows] = useState<JeonseRow[]>([]);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [homeType, setHomeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/jeonse_mean.csv')
      .then((response) => { if (!response.ok) throw new Error('데이터를 불러오지 못했습니다.'); return response.text(); })
      .then((text) => setRows(parseCsv(text)))
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const neighborhoods = useMemo(() => [...new Set(rows.map((row) => `${row.CGG_NM}|${row.STDG_NM}`))].sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const result = useMemo(() => {
    if (!neighborhood || !homeType) return null;
    const [district, dong] = neighborhood.split('|');
    return rows.find((row) => row.CGG_NM === district && row.STDG_NM === dong && row.BLDG_USG === homeType);
  }, [homeType, neighborhood, rows]);
  const selectedLabel = neighborhood?.replace('|', ' · ');

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="mb-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200"><Home className="size-5" aria-hidden="true" /></span>
          <div><p className="text-sm font-semibold text-blue-600">SEOUL JEONSE CHECK</p><h1 className="text-xl font-bold tracking-tight sm:text-2xl">전세가 확인 앱</h1></div>
        </header>
        <section className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-start">
          <div className="pt-2">
            <p className="mb-3 text-sm font-semibold text-blue-600">내 지역 전세 시세</p>
            <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-4xl">동과 주택유형을 선택해<br />평균 전세가를 확인하세요.</h2>
            <p className="mt-5 max-w-md leading-7 text-slate-600">서울시 전월세 실거래 데이터를 바탕으로 계산한 평균 보증금과 거래 건수를 제공합니다.</p>
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-500"><Database className="size-4 text-blue-600" aria-hidden="true" /><span>서울시 전월세 실거래 데이터 기반</span></div>
          </div>
          <Card className="border-blue-100 bg-white py-0 shadow-xl shadow-blue-100/50">
            <CardHeader className="border-b border-slate-100 px-6 py-5"><CardTitle className="text-lg">조건 선택</CardTitle><p className="text-sm text-slate-500">원하는 지역과 주택유형을 골라주세요.</p></CardHeader>
            <CardContent className="space-y-5 px-6 py-6">
              <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="size-4 text-blue-600" aria-hidden="true" />지역 (구 · 동)</span>
                <Select value={neighborhood} onValueChange={setNeighborhood}><SelectTrigger className="h-12 w-full rounded-xl bg-white px-3 text-base"><SelectValue placeholder={rows.length ? '지역을 선택하세요' : '데이터를 불러오는 중...'} /></SelectTrigger><SelectContent className="max-h-72">{neighborhoods.map((item) => <SelectItem key={item} value={item}>{item.replace('|', ' · ')}</SelectItem>)}</SelectContent></Select>
              </label>
              <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="size-4 text-blue-600" aria-hidden="true" />주택유형</span>
                <Select value={homeType} onValueChange={setHomeType}><SelectTrigger className="h-12 w-full rounded-xl bg-white px-3 text-base"><SelectValue placeholder="주택유형을 선택하세요" /></SelectTrigger><SelectContent>{homeTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
              </label>
              <section aria-live="polite" className="min-h-52 rounded-2xl bg-blue-50 p-6">
                {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : result ? <><p className="text-sm font-semibold text-blue-700">{selectedLabel} <ChevronRight className="mx-1 inline size-3" /> {homeType}</p><p className="mt-6 text-sm text-slate-600">평균 전세가</p><p className="mt-1 text-3xl font-bold tracking-tight text-blue-700 sm:text-4xl">{formatPrice(Number(result.평균전세가_만원))}</p><div className="mt-5 border-t border-blue-200 pt-4 text-sm text-slate-600">거래 건수 <strong className="ml-2 text-base text-slate-900">{Number(result.거래건수).toLocaleString()}건</strong></div></> : neighborhood && homeType ? <p className="text-sm leading-6 text-slate-600">선택한 조건에 해당하는 거래 데이터가 없습니다. 다른 주택유형을 선택해 보세요.</p> : <div className="flex h-40 flex-col justify-center"><p className="font-semibold text-slate-800">전세가 정보를 확인해 보세요</p><p className="mt-2 text-sm leading-6 text-slate-500">위의 두 조건을 선택하면 평균 전세가와 거래 건수를 보여드립니다.</p></div>}
              </section>
            </CardContent>
          </Card>
        </section>
        <p className="mt-12 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">평균 전세가는 보증금 기준이며 단위는 만원입니다. 실제 거래 시점과 조건에 따라 차이가 있을 수 있습니다.</p>
      </div>
    </main>
  );
}
