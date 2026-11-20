import { HomeHero } from "./_home/hero";
import { HomeSections } from "./_home/sections";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6">
      <HomeHero />
      <HomeSections />
    </div>
  );
}
