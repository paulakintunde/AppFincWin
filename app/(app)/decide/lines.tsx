import { Redirect, type Href } from 'expo-router';

// 06.1-28 D-05: old path. The lists live on the new Decide home.
export default function LinesRoute() {
  return <Redirect href={'/decide' as Href} />;
}
