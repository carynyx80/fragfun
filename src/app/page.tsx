import { HomeHero } from "./_home/hero";
import { HomeSections } from "./_home/sections";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1240px] overflow-x-clip px-4 lg:px-6">
      <HomeHero />
      <HomeSections />
    </div>
  );
}
