export type ExpansionGrade = 1 | 2 | 3 | 4 | 5 | 6;
export type ICMGrade = 'A' | 'B' | 'C';
export type TEGrade = 'A' | 'B' | 'C';

/** Tier 1 — Core: form the grade string (expansion + ICM + TE → e.g. "5AA") */
export interface BlastocystCore {
  expansion: ExpansionGrade;
  icm: ICMGrade;
  te: TEGrade;
}

/** Tier 2 — Critical: affect transfer decision */
export interface BlastocystCritical {
  hatching: 'Not Hatching' | 'Hatching' | 'Hatched';
  vacuolization: 'None' | 'Minimal' | 'Mild' | 'Moderate' | 'Severe';
  multinucleation: 'None' | 'Minimal' | 'Present';
}

/** Tier 3 — Morphology: structural observations */
export interface BlastocystSupplementary {
  fragmentation: '< 5%' | '5 - 10%' | '10 - 15%' | '15 - 20%' | '20 - 25%' | '25 - 30%' | '> 30%';
  symmetry: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  zonaPellucida: 'Intact' | 'Good' | 'Thinning' | 'Absent';
  blastocoelQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  cytoplasmicGranularity: 'Fine' | 'Coarse';
  bridge: 'None' | 'Minimal' | 'Present';
}

export interface BlastocystMorphology extends BlastocystCore, BlastocystCritical, BlastocystSupplementary {}

export interface EmbryoRecord {
  id: string;
  oocyteNumber: number;
  dayOfDevelopment: 5 | 6;
  timeSinceInsemination: string;
  aiScore: number;
  morphology: BlastocystMorphology;
  imageSrc: string;
  rank?: number;
}
