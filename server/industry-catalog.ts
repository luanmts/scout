export type IndustryCatalogEntry = {
  id: string;
  displayName: string;
  description: string;
  version: number;
  searchTerms: string[];
  categoryAliases: string[];
  serviceKeywords: string[];
};

// These are discovery candidates, not claims about Google's official category taxonomy.
export const INDUSTRY_CATALOG_VERSION = 1;
export const industryCatalog: IndustryCatalogEntry[] = [
  {
    id: "air_conditioning_heating",
    displayName: "Air Conditioning & Heating",
    description: "Heating, cooling, ventilation and indoor air services.",
    version: INDUSTRY_CATALOG_VERSION,
    searchTerms: ["HVAC Contractor", "Air Conditioning Contractor", "Air Conditioning Repair Service", "Heating Contractor", "Furnace Repair Service", "Air Duct Cleaning Service"],
    categoryAliases: ["hvac", "heating", "air conditioning", "air conditioner", "furnace", "air duct", "ventilation"],
    serviceKeywords: ["cooling", "heating", "furnace", "duct", "ventilation"],
  },
  {
    id: "dental",
    displayName: "Dental",
    description: "Dental practices and specialist oral-care services.",
    version: INDUSTRY_CATALOG_VERSION,
    searchTerms: ["Dentist", "Dental Clinic", "Cosmetic Dentist", "Pediatric Dentist", "Orthodontist"],
    categoryAliases: ["dentist", "dental", "orthodont", "oral surgeon", "endodont"],
    serviceKeywords: ["cosmetic", "pediatric", "implant", "teeth", "oral"],
  },
  {
    id: "plumbing",
    displayName: "Plumbing",
    description: "Residential and commercial plumbing services.",
    version: INDUSTRY_CATALOG_VERSION,
    searchTerms: ["Plumber", "Plumbing Contractor", "Emergency Plumber", "Drain Cleaning Service"],
    categoryAliases: ["plumb", "drain", "sewer", "pipe", "water heater"],
    serviceKeywords: ["emergency", "drain", "sewer", "water heater", "leak"],
  },
  {
    id: "roofing",
    displayName: "Roofing",
    description: "Roof installation, repair and maintenance businesses.",
    version: INDUSTRY_CATALOG_VERSION,
    searchTerms: ["Roofing Contractor", "Roof Repair", "Roof Installation"],
    categoryAliases: ["roof", "roofer", "roofing", "shingle", "gutter"],
    serviceKeywords: ["repair", "installation", "commercial", "residential", "gutter"],
  },
];

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function catalogEntry(id: string) {
  return industryCatalog.find((entry) => entry.id === id);
}

export function expandIndustryTerms(industryIds: string[], customTerms: string[] = []) {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const id of industryIds) {
    for (const term of catalogEntry(id)?.searchTerms ?? []) {
      const key = normalize(term);
      if (key && !seen.has(key)) { seen.add(key); terms.push(term); }
    }
  }
  for (const term of customTerms) {
    const value = term.trim();
    const key = normalize(value);
    if (key && !seen.has(key)) { seen.add(key); terms.push(value); }
  }
  return terms;
}

export function isIndustryRelevant(industryIds: string[], category: string, title = "") {
  if (!industryIds.length) return true;
  const text = normalize(`${category} ${title}`);
  if (!text) return false;
  return industryIds.some((id) => {
    const entry = catalogEntry(id);
    return Boolean(entry && [...entry.categoryAliases, ...entry.serviceKeywords].some((alias) => text.includes(normalize(alias))));
  });
}

