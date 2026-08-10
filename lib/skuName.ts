/**
 * A SKU without the brand name it repeats.
 *
 * Product names are stored fully qualified ("EMSYN LEE 10+5MG TAB"), but the
 * brand is already the heading wherever a SKU is listed — printing it again on
 * every pill is the bulk of each label and wraps them onto extra lines. Only the
 * strength/form actually differs between a brand's SKUs.
 *
 * Whitespace is normalised first because some names carry double spaces
 * ("EMSYN  MET XR 12.5/1000"). Falls back to the full name if stripping the
 * brand would leave nothing behind.
 */
export function shortSkuName(skuName: string, brandName: string) {
  const sku = String(skuName ?? '').replace(/\s+/g, ' ').trim();
  const brand = String(brandName ?? '').replace(/\s+/g, ' ').trim();

  if (brand && sku.toLowerCase().startsWith(brand.toLowerCase())) {
    const rest = sku.slice(brand.length).trim();
    if (rest) return rest;
  }

  return sku;
}
