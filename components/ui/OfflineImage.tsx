import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';

import { resolveCachedImage } from '@/lib/offline/imageCache';

interface OfflineImageProps extends Omit<ImageProps, 'source'> {
  /** The image's server address, as the API gives it. */
  url: string;
}

/**
 * An image that shows the copy sync put ON THE DEVICE when there is one, and
 * the server address otherwise — so it renders offline. If the device copy
 * cannot be read (deleted, half-written) it falls back to the server once.
 *
 * The Content screen used to point straight at the server address and rely on
 * the image library's own cache, so offline it showed blank tiles for anything
 * not opened while connected.
 */
export function OfflineImage({ url, onError, ...rest }: OfflineImageProps) {
  const local = resolveCachedImage(url) ?? url;
  const [uri, setUri] = useState(local);
  useEffect(() => setUri(local), [local]);

  return (
    <ExpoImage
      {...rest}
      source={{ uri }}
      onError={(event) => {
        if (uri !== url) setUri(url);
        onError?.(event);
      }}
    />
  );
}
