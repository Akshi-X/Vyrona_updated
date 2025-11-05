import { BaseApiService, type ApiResponse } from './baseApiService';

export interface Patient {
  patient_id: string;
  condition: string;
  hospital: string;
  location: string;
  provider_name: string;
  stage: string;
  treatment_status?: string;
  docs_report: string;
}

export interface OngoingTreatment {
  patient_id: string;
  condition: string;
  hospital: string;
  stage: string | null;
  treatment_status: string;
  provider_name: string;
  location: string;
}

export interface PatientStatistics {
  pharma_id: string;
  current_month_patient_count: number;
  current_month_treatment_count: number;
}

export interface PatientApiResponse extends ApiResponse<Patient[][]> {
  data: Patient[][];
}

export interface PatientResponse {
  id: string;
  patient_name: string;
  condition: string;
  therapy_id: string | null;
  insurance_provider: string | null;
  insurance_type: string | null;
  hospital_name: string | null;
  location: string | null;
  provider_id: string | null;
  pharma_id: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export class PatientService extends BaseApiService {
  /**
   * Get a patient by ID to validate existence
   */
  async getPatientById(patientId: string): Promise<PatientResponse> {
    try {
      const response = await this.request<PatientResponse>(
        `/api/patients/${encodeURIComponent(patientId)}`
      );
      return response;
    } catch (error) {
      // Re-throw so callers can inspect message (e.g., "Patient not found...")
      throw error;
    }
  }

  /**
   * Get a patient's current stage
   */
  async getPatientStage(patientId: string): Promise<{ patient_id: string; stage: string } | null> {
    try {
      const response = await this.request<{ patient_id: string; stage: string }>(
        `/api/patients/${patientId}/stage`
      );
      return response ?? null;
    } catch (error) {
      // Surface errors to caller for optional handling
      throw error;
    }
  }

  /**
   * Get detailed patient information
   */
  async getDetailedPatients(): Promise<Patient[]> {
    try {
      const response = await this.request<Patient[] | Patient[][]>(
        `/api/patients/detailed`
      );
      
      // Handle different response formats
      if (Array.isArray(response)) {
        // Check if response is nested array and flatten it
        if (response.length > 0 && Array.isArray(response[0])) {
          return (response as unknown as Patient[][])[0]; // Return the first (and likely only) array
        }
        // Response is already a flat array
        return response as Patient[];
      }
      
      // If response has a data property, extract it
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        if (Array.isArray(data)) {
          if (data.length > 0 && Array.isArray(data[0])) {
            return data[0];
          }
          return data;
        }
      }
      
      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get ongoing treatments
   */
  async getOngoingTreatments(): Promise<OngoingTreatment[]> {
    try {
      const response = await this.request<OngoingTreatment[]>(
        `/api/patients/ongoing`
      );
      
      // Handle different response formats
      if (Array.isArray(response)) {
        // Check if response is nested array and flatten it
        if (response.length > 0 && Array.isArray(response[0])) {
          return (response as unknown as OngoingTreatment[][])[0];
        }
        // Response is already a flat array
        return response as OngoingTreatment[];
      }
      
      // If response has a data property, extract it
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        if (Array.isArray(data)) {
          if (data.length > 0 && Array.isArray(data[0])) {
            return data[0];
          }
          return data;
        }
      }
      
      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all patients (if there's a general endpoint)
   */
  async getAllPatients(): Promise<Patient[]> {
    try {
      const response = await this.request<Patient[] | PatientApiResponse>('/api/patients');
      
      // Handle different response formats
      if (Array.isArray(response)) {
        if (response.length > 0 && Array.isArray(response[0])) {
          return (response as unknown as Patient[][])[0];
        }
        return response as Patient[];
      }
      
      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        if (Array.isArray(data)) {
          if (data.length > 0 && Array.isArray(data[0])) {
            return data[0];
          }
          return data;
        }
      }
      
      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get patient statistics for a specific pharma
   */
  async getPatientStatistics(pharmaId: string = '1'): Promise<PatientStatistics> {
    try {
      const response = await this.request<PatientStatistics>(
        `/api/patients/statistics/pharma/${pharmaId}`
      );
      
      return response;
    } catch (error) {
      throw error;
    }
  }
}

// Export a singleton instance
export const patientService = new PatientService();
