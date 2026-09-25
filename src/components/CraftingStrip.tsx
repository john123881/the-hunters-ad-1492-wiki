import type { CraftingRecipe } from '../../shared/types';

export function CraftingStrip({ recipe }: { recipe: CraftingRecipe }) {
  const readable = [
    ...recipe.resources.map(resource => `${resource.name} ${resource.quantity}`),
    ...recipe.stations.map(station => `${station.name}等級 ${station.requiredLevel}`),
  ].join('、');

  return <div className="crafting-strip" role="img" aria-label={`合成需求：${readable}`}>
    <div className="crafting-strip-resources" aria-hidden="true">
      {recipe.resources.map(resource => <span className="crafting-token" key={resource.code}>
        <img src={resource.imageUrl} alt="" width={28} height={28} />
        <strong>{resource.quantity}</strong>
      </span>)}
    </div>
    <div className="crafting-strip-stations" aria-hidden="true">
      {recipe.stations.map(station => <span className="crafting-token crafting-station-token" key={station.code}>
        <img src={station.imageUrl} alt="" width={32} height={32} />
        <strong>{station.requiredLevel}</strong>
      </span>)}
    </div>
  </div>;
}
