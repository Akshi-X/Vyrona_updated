export interface IVFTreatment {
  hisNumber: string;
  cryolockNum: string;
  canisterNum: number;
  tankId: string;
  caneId: string;
  gobletColor: string;
  cryolockColor: string;
  dateOfVitrification: string;
  siteName: string;
  status: string;
  // Available from API, not currently displayed in the table UI
  embryoGrading?: string;
}

export interface EmbryoTrackingApiItem {
  his_number: string;
  cryolock_number: string;
  canister_number: number;
  tank_id: string;
  cane_id: string;
  goblet_color: string;
  cryolock_color: string;
  date_of_vitrification: string;
  embryo_grading?: string;
  site_name: string;
  status: string;
}

export interface EmbryoTrackingApiResponse {
  data: EmbryoTrackingApiItem[];
  total: number;
}

export interface TotalEmbryosCryolocksResponse {
  total_embryos: number;
  total_cryolocks: number;
  total_embryos_cryolocks: number;
  last_updated: string;
  status: string;
}
