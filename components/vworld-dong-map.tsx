'use client';

import { useEffect, useRef, useState } from 'react';

type DongFeature = {
  type: 'Feature';
  properties: { EMD_CD: string; EMD_KOR_NM: string };
  geometry: { type: string; coordinates: unknown };
};
type DongCollection = { type: 'FeatureCollection'; features: DongFeature[] };
type VWorldGlobals = {
  vw: {
    ol3: {
      MapOptions: unknown;
      BasemapType: { GRAPHIC: unknown };
      DensityType: { BASIC: unknown; EMPTY: unknown };
      CameraPosition: unknown;
      Map: new (target: string, options: unknown) => any;
    };
  };
  ol: any;
};

const districtByCode: Record<string, string> = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구',
};

export function VWorldDongMap({ selectedDistrict, selectedDong, onSelect }: {
  selectedDistrict: string | null;
  selectedDong: string | null;
  onSelect: (district: string, dong: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const vectorLayerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState<string | null>(null);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let disposed = false;
    let map: any;
    const loadSdk = async () => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-vworld-sdk]');
      if (existing) {
        if ((window as any).vw?.ol3?.Map) return;
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('VWorld 지도를 불러오지 못했습니다.')), { once: true });
        });
        return;
      }
      const configResponse = await fetch('/api/vworld-sdk-config', { cache: 'no-store' });
      const config = await configResponse.json() as { scriptUrl?: string; error?: string };
      if (!configResponse.ok || !config.scriptUrl) throw new Error(config.error || 'VWorld 지도 설정을 불러오지 못했습니다.');
      const script = document.createElement('script');
      script.src = config.scriptUrl;
      script.dataset.vworldSdk = 'true';
      const scriptLoaded = new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('VWorld 지도 SDK를 불러오지 못했습니다.'));
      });
      document.head.appendChild(script);
      await scriptLoaded;
    };

    async function initialize() {
      try {
        await loadSdk();
        if (disposed || !containerRef.current) return;
        const globals = window as unknown as VWorldGlobals;
        const { vw, ol } = globals;
        if (!vw?.ol3?.Map || !ol) throw new Error('VWorld 지도 SDK 초기화에 실패했습니다.');
        vw.ol3.MapOptions = {
          basemapType: vw.ol3.BasemapType.GRAPHIC,
          controlDensity: vw.ol3.DensityType.EMPTY,
          interactionDensity: vw.ol3.DensityType.BASIC,
          controlsAutoArrange: true,
          homePosition: vw.ol3.CameraPosition,
          initPosition: vw.ol3.CameraPosition,
        };
        map = new vw.ol3.Map(containerRef.current.id, vw.ol3.MapOptions);
        mapRef.current = map;
        const view = map.getView();
        view.setCenter(ol.proj.fromLonLat([126.978, 37.5665]));
        view.setZoom(11);

        const response = await fetch('/seoul-neighborhoods.geo.json');
        if (!response.ok) throw new Error('서울 동 경계 데이터를 불러오지 못했습니다.');
        const geojson = await response.json() as DongCollection;
        if (disposed) return;
        const features = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
        const source = new ol.source.Vector({ features });
        const styleForFeature = (feature: any) => {
          const code = String(feature.get('EMD_CD') || '').slice(0, 5);
          const name = String(feature.get('EMD_KOR_NM') || '');
          const active = districtByCode[code] === selectedDistrict && name === selectedDong;
          const zoom = map.getView().getZoom() || 0;
          return new ol.style.Style({
            fill: new ol.style.Fill({ color: active ? 'rgba(37,99,235,0.68)' : 'rgba(59,130,246,0.12)' }),
            stroke: new ol.style.Stroke({ color: active ? '#1d4ed8' : 'rgba(30,64,175,0.55)', width: active ? 2.4 : 0.8 }),
            text: zoom >= 12 ? new ol.style.Text({
              text: name,
              font: active ? 'bold 12px sans-serif' : '11px sans-serif',
              fill: new ol.style.Fill({ color: '#172554' }),
              stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
              overflow: false,
            }) : undefined,
          });
        };
        const layer = new ol.layer.Vector({ source, style: styleForFeature });
        vectorLayerRef.current = layer;
        map.addLayer(layer);
        map.on('singleclick', (event: any) => {
          const feature = map.forEachFeatureAtPixel(event.pixel, (hit: any) => hit);
          if (!feature) return;
          const code = String(feature.get('EMD_CD') || '').slice(0, 5);
          const district = districtByCode[code];
          const dong = String(feature.get('EMD_KOR_NM') || '');
          if (district && dong) onSelectRef.current(district, dong);
        });
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : '지도를 불러오지 못했습니다.');
      }
    }

    void initialize();
    return () => {
      disposed = true;
      if (map) map.setTarget(undefined);
      mapRef.current = null;
      vectorLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = vectorLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    const { ol } = window as unknown as VWorldGlobals;
    layer.setStyle((feature: any) => {
      const code = String(feature.get('EMD_CD') || '').slice(0, 5);
      const name = String(feature.get('EMD_KOR_NM') || '');
      const active = districtByCode[code] === selectedDistrict && name === selectedDong;
      const showLabels = (map.getView().getZoom() || 0) >= 12;
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: active ? 'rgba(37,99,235,0.68)' : 'rgba(59,130,246,0.12)' }),
        stroke: new ol.style.Stroke({ color: active ? '#1d4ed8' : 'rgba(30,64,175,0.55)', width: active ? 2.4 : 0.8 }),
        text: showLabels ? new ol.style.Text({ text: name, font: active ? 'bold 12px sans-serif' : '11px sans-serif', fill: new ol.style.Fill({ color: '#172554' }), stroke: new ol.style.Stroke({ color: '#fff', width: 3 }) }) : undefined,
      });
    });
    layer.changed();
  }, [selectedDistrict, selectedDong]);

  return <div className="relative overflow-hidden rounded-2xl bg-[#eaf1f7]">
    <div ref={containerRef} id="seoul-vworld-dong-map" className="h-[420px] w-full sm:h-[500px]" aria-label="VWorld 서울 동 단위 선택 지도" />
    {error && <div className="absolute inset-0 grid place-items-center bg-slate-100/95 px-6 text-center text-sm text-rose-700">{error}</div>}
  </div>;
}
