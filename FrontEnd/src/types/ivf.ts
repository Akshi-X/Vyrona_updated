export interface IVFTreatment {
  hisNumber: string;
  patientName?: string;
  cryolockNum: string;
  canisterNum: number;
  embryo_count?: number;
  oocyte_m2?: number;
  oocyte_m1?: number;
  oocyte_gv?: number;
  oocyte_others?: number;
  tankCode: string;
  caneCode: string;
  gobletColor: string;
  cryolockColor: string;
  dateOfVitrification: string;
  siteName: string;
  status: string;
  // Available from API, not currently displayed in the table UI
  embryoGrading?: string;
  description?: string | null;
  injectionMethod?: string;
  spermQuality?: string;
  oocytesQuality?: string;
  cycleType?: string;
  incubatorCode?: string;
  chamberPosition?: string;
}

export interface EmbryoTrackingApiResponse {
  data: IVFTreatment[];
  total: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
  next_offset?: number | null;
  message?: string;
}

export interface TotalEmbryosCryolocksResponse {
  total_embryos: number;
  total_cryolocks: number;
  total_embryos_cryolocks: number;
  last_updated: string;
  status: string;
}
