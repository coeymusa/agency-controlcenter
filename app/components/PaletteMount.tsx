import { getSearchIndex } from "@/lib/search";
import { CommandPalette } from "./CommandPalette";

export async function PaletteMount() {
  let items: Awaited<ReturnType<typeof getSearchIndex>> = [];
  try { items = await getSearchIndex(); } catch {/* no DB on first boot; degrade gracefully */}
  return <CommandPalette items={items} />;
}
