'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

type Position = [number, number, ...number[]];
type DongFeature = {
  type: 'Feature';
  properties: { EMD_CD: string; EMD_KOR_NM: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
};
type DongCollection = { type: 'FeatureCollection'; features: DongFeature[] };
type MapView = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const mapWidth = 600;
const mapHeight = 500;
const padding = 20;
const bounds: [number, number, number, number] = [126.734, 37.413, 127.269, 37.716];
const mercatorX = (longitude: number) => longitude * Math.PI / 180;
const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 360));
const minX = mercatorX(bounds[0]);
const maxX = mercatorX(bounds[2]);
const minY = mercatorY(bounds[1]);
const maxY = mercatorY(bounds[3]);
const scale = Math.min((mapWidth - padding * 2) / (maxX - minX), (mapHeight - padding * 2) / (maxY - minY));
const mapLeft = (mapWidth - (maxX - minX) * scale) / 2;
const mapTop = (mapHeight - (maxY - minY) * scale) / 2;

const districtByCode: Record<string, string> = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구',
};

function project([longitude, latitude]: Position): Point {
  return { x: mapLeft + (mercatorX(longitude) - minX) * scale, y: mapTop + (maxY - mercatorY(latitude)) * scale };
}

function polygons(feature: DongFeature): Position[][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as Position[][]]
    : feature.geometry.coordinates as Position[][][];
}

function pathFor(feature: DongFeature) {
  return polygons(feature).map((polygon) => polygon.map((ring) => ring.map((position, index) => {
    const point = project(position);
    return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(' ') + ' Z').join(' ')).join(' ');
}

function featureCenter(feature: DongFeature): Point {
  const points = polygons(feature).flat(2).map(project);
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function SeoulDongMap({ selectedDistrict, selectedDong, selectedDongCode, districtFilter, onSelect }: {
  selectedDistrict: string | null;
  selectedDong: string | null;
  selectedDongCode: string | null;
  districtFilter?: string | null;
  onSelect: (district: string, dong: string, dongCode: string) => void;
}) {
  const [features, setFeatures] = useState<DongFeature[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<MapView>({ x: 0, y: 0, width: mapWidth, height: mapHeight });
  const dragRef = useRef<{ x: number; y: number; view: MapView } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/seoul-neighborhoods.geo.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('서울 동 경계 데이터를 불러오지 못했습니다.');
        return response.json() as Promise<DongCollection>;
      })
      .then((data) => setFeatures(data.features))
      .catch((error: Error) => { if (error.name !== 'AbortError') setLoadError(error.message); });
    return () => controller.abort();
  }, []);

  const paths = useMemo(() => features.map((feature) => ({ feature, path: pathFor(feature), center: featureCenter(feature) })), [features]);
  const zoom = mapWidth / view.width;

  function zoomAt(factor: number, point = { x: view.x + view.width / 2, y: view.y + view.height / 2 }) {
    setView((current) => {
      const width = Math.max(mapWidth / 8, Math.min(mapWidth, current.width * factor));
      const height = width * mapHeight / mapWidth;
      const ratio = width / current.width;
      return { x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio, width, height };
    });
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: view.x + ((event.clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((event.clientY - rect.top) / rect.height) * view.height,
    };
    zoomAt(event.deltaY < 0 ? 0.82 : 1.22, point);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest('button')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, view };
    draggedRef.current = false;
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const start = dragRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) draggedRef.current = true;
    if (draggedRef.current) setView({ ...start.view, x: start.view.x - dx * start.view.width / rect.width, y: start.view.y - dy * start.view.height / rect.height });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[#f3f6f8]">
    {features.length ? <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} className="block h-[420px] w-full touch-none sm:h-[500px]" role="img" aria-label="서울 동 단위 선택 지도" onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <title>서울 동 단위 선택 지도</title>
      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#f3f6f8" />
      {paths.map(({ feature, path, center }) => {
        const code = feature.properties.EMD_CD.slice(0, 5);
        const name = feature.properties.EMD_KOR_NM;
        const district = districtByCode[code];
        const enabled = !districtFilter || district === districtFilter;
        const active = district === selectedDistrict && (selectedDongCode ? feature.properties.EMD_CD === selectedDongCode : name === selectedDong && paths.find((entry) => entry.feature.properties.EMD_KOR_NM === name && districtByCode[entry.feature.properties.EMD_CD.slice(0, 5)] === district)?.feature.properties.EMD_CD === feature.properties.EMD_CD);
        const labelVisible = zoom >= 3.2 && center.x >= view.x && center.x <= view.x + view.width && center.y >= view.y && center.y <= view.y + view.height;
        return <g key={feature.properties.EMD_CD} className={enabled ? 'cursor-pointer' : 'cursor-not-allowed'} role="button" tabIndex={enabled ? 0 : -1} aria-label={`${district ?? ''} ${name}${enabled ? ' 선택' : ' (선택한 구 외부)'}`} aria-disabled={!enabled} aria-pressed={active} onClick={() => { if (!draggedRef.current && district && enabled) onSelect(district, name, feature.properties.EMD_CD); draggedRef.current = false; }} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && district && enabled) { event.preventDefault(); onSelect(district, name, feature.properties.EMD_CD); } }}>
          <path d={path} fill={active ? '#2563eb' : enabled ? '#dbe7f0' : '#e8edf1'} fillRule="evenodd" stroke={active ? '#1d4ed8' : enabled ? '#647b8d' : '#cbd5e1'} strokeWidth={active ? 1.3 / zoom : 0.55 / zoom} className={enabled ? 'transition-colors hover:fill-blue-300' : ''} />
          {(labelVisible || active) && <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(11 / zoom, 11)} fontWeight={active ? 700 : 500} fill={active ? '#1d4ed8' : '#334155'} stroke="white" strokeWidth={2 / zoom} paintOrder="stroke" pointerEvents="none">{name}</text>}
          <title>{district} {name}</title>
        </g>;
      })}
    </svg> : <div className="grid h-[420px] place-items-center text-sm text-slate-500 sm:h-[500px]">{loadError || '서울 동 경계를 불러오는 중입니다.'}</div>}
    <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" className="grid size-10 place-items-center text-slate-700 hover:bg-slate-50" aria-label="확대" onClick={() => zoomAt(0.75)}><Plus className="size-4" /></button>
      <button type="button" className="grid size-10 place-items-center border-t border-slate-100 text-slate-700 hover:bg-slate-50" aria-label="축소" onClick={() => zoomAt(1.33)}><Minus className="size-4" /></button>
      <button type="button" className="grid size-10 place-items-center border-t border-slate-100 text-slate-700 hover:bg-slate-50" aria-label="전체 서울 보기" onClick={() => setView({ x: 0, y: 0, width: mapWidth, height: mapHeight })}><RotateCcw className="size-4" /></button>
    </div>
    <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm">동 경계 자료 · southkorea/seoul-maps</div>
  </div>;
}
