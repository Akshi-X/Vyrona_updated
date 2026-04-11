import { BaseApiService } from "./baseApiService";
import type { OnboardingState, OnboardingEvent } from "../types/onboarding";
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
            // Ignore sync errors for now
        }
    }

    async appendEvents(events: OnboardingEvent[]): Promise<void> {
        if (events.length === 0) return;
        if (!authUtils.getToken()) {
            return;
        }
        try {
            await this.request("/api/onboarding/events", {
                method: "POST",
                body: JSON.stringify({ events }),
            });
        } catch {
            // Ignore sync errors for now
        }
    }
}

export const onboardingService = new OnboardingService();
