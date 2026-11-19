import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FeaturesScreen, parseFeaturesPreview } from '@/features/levels/FeaturesScreen';

// 09-23: `?preview=1&level=&on=&off=` opens the read-only preview from the onboarding summary.
export default function FeaturesRoute() {
  const params = useLocalSearchParams<{ preview?: string; level?: string; on?: string; off?: string }>();
  const { preview: p, level, on, off } = params;
  const preview = useMemo(() => parseFeaturesPreview({ preview: p, level, on, off }), [p, level, on, off]);
  return <FeaturesScreen {...(preview !== undefined ? { preview } : {})} />;
}
