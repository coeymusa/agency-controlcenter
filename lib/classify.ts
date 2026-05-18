// Heuristics for inferring region + industry from a pitch slug / business name.
// Used by the import script and surfaced as filter values in the dashboard.

const REGION_RULES: { match: RegExp; region: string }[] = [
  { match: /(^|[-_ ])iom([-_ ]|$)|isle.?of.?man|douglas|ramsey|peel|castletown/i, region: "Isle of Man" },
  { match: /bristol|clifton|bedminster|filton|warmley/i, region: "Bristol" },
  { match: /cardiff|penarth|barry|caerphilly|llanishen|roath/i, region: "Cardiff" },
  { match: /swansea|gower|mumbles/i, region: "Swansea" },
  { match: /newport(?!.*pagnell)/i, region: "Newport" },
  { match: /london|hackney|shoreditch|camden/i, region: "London" },
  { match: /manchester|salford/i, region: "Manchester" },
  { match: /birmingham/i, region: "Birmingham" },
  { match: /switzerland|zurich|geneva|basel|bern/i, region: "Switzerland" },
];

const INDUSTRY_RULES: { match: RegExp; industry: string }[] = [
  { match: /dental|dentist|orthodont|denture/i, industry: "Dental" },
  { match: /kitchen|cabinet|joiner|worktop/i, industry: "Kitchens" },
  { match: /solicit|legal|law(yers?)?|barrister|conveyanc/i, industry: "Legal" },
  { match: /accountan|bookkeep|tax/i, industry: "Accounting" },
  { match: /bike|cycling|cycle/i, industry: "Bicycles" },
  { match: /plumb|heating|boiler|gas/i, industry: "Plumbing & Heating" },
  { match: /electric/i, industry: "Electrical" },
  { match: /builder|building|construction|roof|render/i, industry: "Construction" },
  { match: /garden|landscap/i, industry: "Landscaping" },
  { match: /clean(ing|ers?)/i, industry: "Cleaning" },
  { match: /barber|salon|hair|beauty|nails/i, industry: "Beauty" },
  { match: /restaurant|cafe|bistro|coffee|kitchen.*food/i, industry: "Hospitality" },
  { match: /vet(erinary)?/i, industry: "Veterinary" },
  { match: /physio|chiro|osteo|massage/i, industry: "Health" },
  { match: /estate.?agent|letting|property/i, industry: "Property" },
  { match: /removal|storage|man.?with.?van/i, industry: "Removals" },
  { match: /car(s|.?wash|.?valet|.?repair|.?service)|garage|mechanic|MOT/i, industry: "Automotive" },
  { match: /photograph|videograph/i, industry: "Photography" },
  { match: /printer|signage|signs/i, industry: "Print & Signage" },
  { match: /florist|flowers/i, industry: "Florist" },
  { match: /tailor|alteration|seamstress/i, industry: "Tailoring" },
  { match: /butcher|farm|bakery|baker/i, industry: "Food Producer" },
];

export function inferRegion(input: string): string | null {
  for (const r of REGION_RULES) if (r.match.test(input)) return r.region;
  return null;
}

export function inferIndustry(input: string): string | null {
  for (const r of INDUSTRY_RULES) if (r.match.test(input)) return r.industry;
  return null;
}

export const ALL_STATUSES = [
  "lead",
  "researched",
  "mock_built",
  "emailed",
  "opened",
  "clicked",
  "replied",
  "meeting",
  "won",
  "lost",
  "ignored",
] as const;
