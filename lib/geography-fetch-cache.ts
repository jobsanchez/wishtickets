type ProvinceRow = { id: string; name: string };
type CityRow = { id: string; name: string };

const provincesByBase = new Map<string, ProvinceRow[]>();
const citiesByProvinceUrl = new Map<string, CityRow[]>();

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geography fetch failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Cached provinces list for a geography API base (`/api/geography` or `/api/admin/geography`). */
export async function fetchProvincesCached(geographyBase: string): Promise<ProvinceRow[]> {
  const cached = provincesByBase.get(geographyBase);
  if (cached) return cached;
  const data = await fetchJson(geographyBase);
  const provinces = Array.isArray(data.provinces) ? (data.provinces as ProvinceRow[]) : [];
  provincesByBase.set(geographyBase, provinces);
  return provinces;
}

/** Cached cities for a province; `geographyBase` is the provinces endpoint URL. */
export async function fetchCitiesForProvinceCached(
  geographyBase: string,
  provinceId: string
): Promise<CityRow[]> {
  const url = `${geographyBase}?province_id=${encodeURIComponent(provinceId)}`;
  const cached = citiesByProvinceUrl.get(url);
  if (cached) return cached;
  const data = await fetchJson(url);
  const cities = Array.isArray(data.cities) ? (data.cities as CityRow[]) : [];
  citiesByProvinceUrl.set(url, cities);
  return cities;
}
