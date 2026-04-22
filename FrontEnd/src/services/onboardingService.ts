import { BaseApiService } from "./baseApiService";
import type { OnboardingState } from "../types/onboarding";
import { authUtils } from "../utils/auth";

export interface OnboardingStateResponse {
    state: OnboardingState;
}

export class OnboardingService extends BaseApiService {
    async getState(): Promise<OnboardingState | null> {
        if (!authUtils.getToken()) {
            return null;
        }
        try {
            const response = await this.request<OnboardingStateResponse>("/api/onboarding/state", {
                method: "GET",
            });
            return response?.state ?? null;
        } catch {
            return null;
        }
    }

    async saveState(state: OnboardingState): Promise<void> {
        if (!authUtils.getToken()) {
            return;
        }
        try {
            await this.request("/api/onboarding/state", {
                method: "PATCH",
                body: JSON.stringify({ state }),
            });
        } catch {
            // Ignore sync errors
        }
    }
}

export const onboardingService = new OnboardingService();
