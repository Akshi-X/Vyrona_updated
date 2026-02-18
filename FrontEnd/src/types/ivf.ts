export interface IVFTreatment {
  hisNumber: string;
  cryolockNum: string;
  canisterNum: number;
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
