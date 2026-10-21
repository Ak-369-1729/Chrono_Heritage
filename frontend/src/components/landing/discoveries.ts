import type { SceneKey } from "./choreography";

export interface HeritageDiscovery {
  id: string;
  category: string;
  title: string;
  fact: string;
  source: string;
  sourceUrl: string;
  room: SceneKey;
}

const HAWA_MAHAL_SOURCE = "Rajasthan Tourism: Hawa Mahal";
const HAWA_MAHAL_URL = "https://www.tourism.rajasthan.gov.in/hawa-mahal.html";

/** Verified examples from Hawa Mahal; the procedural landing scene depicts no real monument. */
export const HERITAGE_DISCOVERIES: HeritageDiscovery[] = [
  {
    id: "jharokhas",
    category: "Jharokha architecture",
    title: "A view from the jharokhas",
    fact: "Rajasthan Tourism describes Hawa Mahal's jharokhas as places from which royal women and the court could observe Johari Bazaar without being seen.",
    source: HAWA_MAHAL_SOURCE,
    sourceUrl: HAWA_MAHAL_URL,
    room: "gateway",
  },
  {
    id: "airflow",
    category: "Passive ventilation",
    title: "A palace shaped by airflow",
    fact: "The Rajasthan Tourism account links the many windows and jharokhas at Hawa Mahal with its ventilation and the name “Palace of the Winds.”",
    source: HAWA_MAHAL_SOURCE,
    sourceUrl: HAWA_MAHAL_URL,
    room: "gateway",
  },
  {
    id: "facade",
    category: "Palace form",
    title: "A five-storey facade",
    fact: "Rajasthan Tourism describes Hawa Mahal in Jaipur as a five-storey building with a honeycomb-like appearance.",
    source: HAWA_MAHAL_SOURCE,
    sourceUrl: HAWA_MAHAL_URL,
    room: "threshold",
  },
  {
    id: "horizon",
    category: "Field recording",
    title: "The horizon is part of the observation",
    fact: "A building's measured axis and the skyline in front of it are distinct inputs; recording both keeps the comparison tied to the view from the site.",
    source: "ChronoHeritage Sky Explorer",
    sourceUrl: "/sky",
    room: "courtyard",
  },
  {
    id: "provenance",
    category: "Research provenance",
    title: "Keep the trail with the result",
    fact: "A reproducible report keeps its sources, assumptions, software version and uncertainty attached to the calculation.",
    source: "ChronoHeritage research method",
    sourceUrl: "/documentation",
    room: "vault",
  },
  {
    id: "polar-gnomon",
    category: "Instrument design",
    title: "A gnomon's slope follows the pole",
    fact: "For a polar gnomon, the aligned edge is elevated by the observer's latitude; this illustrative instrument uses 27° N.",
    source: "ChronoHeritage Sky Explorer",
    sourceUrl: "/sky",
    room: "instrument",
  },
  {
    id: "open-sky",
    category: "Observing conditions",
    title: "The terrace brings back the sky",
    fact: "Stars disappear beneath the covered gallery and archive, then return above the open rooftop terrace.",
    source: "ChronoHeritage scene design",
    sourceUrl: "/documentation",
    room: "workspace",
  },
];
