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

export interface EmbryoTrackingApiResponse {
  data: IVFTreatment[];
  total: number;
}

export interface TotalEmbryosCryolocksResponse {
  total_embryos: number;
  total_cryolocks: number;
  total_embryos_cryolocks: number;
  last_updated: string;
  status: string;
}
