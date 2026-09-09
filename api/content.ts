import { useQuery } from '@tanstack/react-query';
import axios from '@/config/axios';
import { ApiEndpoints } from '@/api/endpoints';
import { API_BASE_URL } from '@/config/api-base-url';
import { resolveCachedImage } from '@/lib/offline/imageCache';

export interface ForcingContentRow {
  team_id: number;
  team_name: string;
  specialty_id: number;
  brand_id?: string | null;
  brand_name?: string | null;
  sku_id?: number | null;
  sku_name?: string | null;
  url: string;
  status: string;
  forcing: number | null;
  duration: string | null;
}

export interface ForcingContentResponse {
  success: boolean;
  count: number;
  teamId: number;
  doctorId: string;
  data: ForcingContentRow[];
}

interface ForcingContentParams {
  teamId?: number;
  doctorId?: string;
  // Institution calls resolve forcing by a chosen specialty instead of a doctor.
  specialtyId?: number;
}

export interface Specialty {
  specialty_id: number;
  specialty_name: string;
}

export const specialtiesKey = (mieId?: string) =>
  ['specialties', mieId ?? 'all'] as const;

export const getSpecialties = async (mieId?: string): Promise<Specialty[]> => {
  const res = (await axios.get(ApiEndpoints.specialties, {
    params: mieId ? { mieId } : undefined,
  })) as unknown as {
    success: boolean;
    data: Specialty[];
  };
  return res.data ?? [];
};

/**
 * Specialties for the institution-call picker (cached + offline-persisted).
 * Pass the rep's mieId to get only the specialties they hold doctors for —
 * choosing one they carry none of would leave the End-of-call picker empty.
 */
export const useSpecialties = (mieId?: string) => {
  return useQuery({
    queryKey: specialtiesKey(mieId),
    queryFn: () => getSpecialties(mieId),
    staleTime: 30 * 60 * 1000,
  });
};

export interface TeamBrandSku {
  skuId: number | null;
  skuName: string;
  forcing: number | null;
  slideCount: number;
  /** Every image for the SKU, in play order. */
  slideUrls?: string[];
}

export interface TeamBrand {
  brandId: string | null;
  brandName: string;
  forcing: number | null;
  /** Images across the brand, including its SKUs. */
  slideCount: number;
  /** Every image for the brand, in play order. */
  slideUrls?: string[];
  skus: TeamBrandSku[];
}

export const teamBrandsKey = (teamId?: number) =>
  ['team-brands', teamId ?? 'no-team'] as const;

export const getTeamBrands = async (teamId: number): Promise<TeamBrand[]> => {
  const res = (await axios.get(ApiEndpoints.teamBrands, {
    params: { teamId },
  })) as unknown as { success: boolean; data: TeamBrand[] };

  // Point the previews at whatever host this build talks to, the same way slide
  // images are resolved — a stored URL may carry a different origin.
  return (res.data ?? []).map((brand) => ({
    ...brand,
    slideUrls: (brand.slideUrls ?? []).map(normalizeAssetUrl),
    skus: brand.skus.map((sku) => ({
      ...sku,
      slideUrls: (sku.slideUrls ?? []).map(normalizeAssetUrl),
    })),
  }));
};

/**
 * The brands + SKUs assigned to the rep's team — what they detail on. Cached (and
 * offline-persisted) so the Content Viewing screen works without a network.
 */
export const useTeamBrands = (teamId?: number) => {
  return useQuery({
    queryKey: teamBrandsKey(teamId),
    queryFn: () => getTeamBrands(teamId as number),
    enabled: Boolean(teamId),
    staleTime: 30 * 60 * 1000,
  });
};

/** One SKU in the rep's product book — a name, nothing else. */
export interface MieSku {
  skuId: string | null;
  skuName: string;
}

/** One brand the rep carries, with every SKU under it. */
export interface MieBrand {
  brandId: string | null;
  brandName: string;
  skus: MieSku[];
}

export const mieBrandsKey = (mieId?: string) =>
  ['mie-brands', mieId ?? 'no-mie'] as const;

export const getMieBrands = async (mieId: string): Promise<MieBrand[]> => {
  const res = (await axios.get(ApiEndpoints.mieBrands, {
    params: { mieId },
  })) as unknown as { success: boolean; data: MieBrand[] };

  return res.data ?? [];
};

/**
 * Every brand and SKU mapped to this rep — their whole product book.
 *
 * Sourced from `products`/`brands` (via the rep's team), NOT from the forcing
 * table: forcing only covers what is currently being pushed, which is a subset
 * of what the rep actually carries.
 */
export const useMieBrands = (mieId?: string) => {
  return useQuery<MieBrand[]>({
    queryKey: mieBrandsKey(mieId),
    queryFn: () => getMieBrands(mieId as string),
    enabled: Boolean(mieId),
    staleTime: 30 * 60 * 1000,
  });
};

function parseDurationSeconds(duration: string | null | undefined) {
  const match = String(duration ?? '').match(/(\d+)/);
  const seconds = match ? Number(match[1]) : 10;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 10;
}

export function normalizeAssetUrl(url: string) {
  const rawUrl = String(url ?? '').trim();
  if (!API_BASE_URL || !rawUrl) {
    return rawUrl;
  }

  try {
    const apiOrigin = new URL(API_BASE_URL).origin;
    const sanitizedUrl = rawUrl.replace(/\\/g, '/');
    const assetUrl = new URL(sanitizedUrl, apiOrigin);
    const uploadPathIndex = assetUrl.pathname.toLowerCase().indexOf('/uploads/');

    if (assetUrl.hostname === 'localhost' || assetUrl.hostname === '127.0.0.1') {
      return `${apiOrigin}${encodeURI(assetUrl.pathname)}${assetUrl.search}`;
    }

    if (uploadPathIndex >= 0 && !/^(https?:)?\/\//i.test(sanitizedUrl)) {
      const uploadPath = assetUrl.pathname.slice(uploadPathIndex);
      return `${apiOrigin}${encodeURI(uploadPath)}${assetUrl.search}`;
    }

    return assetUrl.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * A slide's identity for ANALYTICS — the image's path, without the host.
 *
 * The full URL is not stable enough to aggregate on: the same image is served
 * from whatever origin the device happened to be pointed at, so a rep who
 * switched from staging to production would report one slide as two. The path
 * under /uploads is the image, and is the same everywhere it is served from.
 */
export function slideIdentity(url: string) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    const index = parsed.pathname.toLowerCase().indexOf('/uploads/');
    return index >= 0 ? parsed.pathname.slice(index) : parsed.pathname;
  } catch {
    // A bare path was passed in — already what this returns.
    return normalized;
  }
}

export const forcingContentKey = (
  teamId?: number,
  doctorId?: string,
  specialtyId?: number,
) =>
  [
    'forcing-content',
    teamId ?? 'no-team',
    doctorId ?? 'no-doctor',
    specialtyId ?? 'no-specialty',
  ] as const;

export const getForcingContent = async ({
  teamId,
  doctorId,
  specialtyId,
}: ForcingContentParams): Promise<ForcingContentResponse> => {
  return axios.get(ApiEndpoints.forcingContent, {
    params: {
      teamId,
      doctorId,
      specialtyId,
    },
  }) as unknown as Promise<ForcingContentResponse>;
};

export interface DoctorCallSlide {
  id: string;
  brand: string;
  // Actual brand + SKU names (for call recording); `brand`/`title`/`subtitle`
  // are the display fields.
  brandName?: string;
  skuName?: string;
  title: string;
  subtitle: string;
  bullets: string[];
  durationSeconds: number;
  image?: { uri: string };
  /**
   * What identifies this slide when its time is reported — see `slideIdentity`.
   * NOT `image.uri`, which is the on-device copy and differs per device.
   */
  slideId?: string;
  /** The deck's own play-order value ((priority × 100) + sequence). */
  forcing?: number | null;
}

function numericPriority(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;
}

// Group key = SKU (sku-wise forcing) or brand (brand-wise forcing, no SKU).
function forcingGroupKey(row: ForcingContentRow) {
  return row.sku_name || row.brand_name || '';
}

function sortForcingRows(rows: ForcingContentRow[]) {
  const groupPriorityBySku = new Map<string, number>();

  rows.forEach((row) => {
    const key = forcingGroupKey(row);
    const priority = numericPriority(row.forcing);
    const current = groupPriorityBySku.get(key);
    if (current == null || priority < current) {
      groupPriorityBySku.set(key, priority);
    }
  });

  return [...rows].sort((left, right) => {
    const leftGroup = groupPriorityBySku.get(forcingGroupKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightGroup = groupPriorityBySku.get(forcingGroupKey(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }

    const leftPriority = numericPriority(left.forcing);
    const rightPriority = numericPriority(right.forcing);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftUrl = left.url ?? '';
    const rightUrl = right.url ?? '';
    return leftUrl.localeCompare(rightUrl);
  });
}

export const useForcingSlides = ({ teamId, doctorId, specialtyId }: ForcingContentParams) => {
  return useQuery({
    queryKey: forcingContentKey(teamId, doctorId, specialtyId),
    queryFn: () => getForcingContent({ teamId, doctorId, specialtyId }),
    enabled: Boolean(teamId && (doctorId || specialtyId)),
    staleTime: 5 * 60 * 1000,
    select: (response): DoctorCallSlide[] =>
      sortForcingRows(response.data)
        .map((row, index) => ({
        id: `${row.sku_name || row.brand_name}-${row.forcing ?? index}-${index}`,
        brand: row.team_name || 'Searle Pharmaceuticals',
        brandName: row.brand_name || undefined,
        skuName: row.sku_name || undefined,
        title: row.brand_name || row.sku_name || 'Forcing Content',
        subtitle: row.sku_name || row.brand_name || 'Doctor Call',
        bullets: [],
        durationSeconds: parseDurationSeconds(row.duration),
        // Use the on-device copy when available so slides play offline.
        image: { uri: resolveCachedImage(normalizeAssetUrl(row.url)) ?? '' },
        slideId: slideIdentity(row.url),
        forcing: row.forcing ?? null,
      })),
  });
};

/** Image URLs (as the slides will request them) for a forcing response. */
export function forcingImageUrls(response: ForcingContentResponse): string[] {
  return response.data
    .map((row) => normalizeAssetUrl(row.url))
    .filter(Boolean);
}

