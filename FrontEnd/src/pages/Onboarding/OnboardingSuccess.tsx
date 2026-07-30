import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageLayout from "../../components/PageLayout";
import { CheckCircle } from "lucide-react";

const OnboardingSuccess: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation() as { state?: any };
    const ticketId = location.state?.ticketId;
    const ticketNumber = location.state?.ticketNumber;

    return (
        <PageLayout title="Onboarding Complete" lucideIcon={CheckCircle}>
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto overflow-x-hidden min-h-0">
                <div className="max-w-2xl mx-auto w-full">
                    <div id="onboarding-success-card" className="bg-white rounded-lg shadow-lg p-12">
                    {/* Success Icon */}
                    <div className="flex justify-center mb-8">
                        <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
                        Thank you for submitting your feedback.
                    </h1>

                    <p className="text-gray-600 text-center mb-10 leading-relaxed">
                        A member of our team will be in touch shortly. You can track your past tickets in the Support section of your profile.
                    </p>

                    {ticketId && (
                        <div id="onboarding-success-ticket" className="bg-gray-50 rounded-lg p-6 mb-8">
                            <p className="text-sm text-gray-600 text-center">
                                <span className="font-medium">Ticket ID:</span> {ticketNumber || ticketId}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        <button
                            id="onboarding-success-dashboard-btn"
                            onClick={() => navigate("/onboarding/dashboard")}
                            className="w-full bg-primary text-white py-4 px-6 rounded-lg font-medium hover:bg-[#8a2a95] transition-colors duration-200"
                        >
                            Go to Dashboard
                        </button>
                        <button
                            id="onboarding-success-profile-btn"
                            onClick={() => navigate("/onboarding/user-profile")}
                            className="w-full border border-primary text-primary py-4 px-6 rounded-lg font-medium hover:bg-purple-50 transition-colors duration-200"
                        >
                            Go to Profile
                        </button>
                    </div>
                </div>
            </div>
            </div>

        </PageLayout>
    );
};

export default OnboardingSuccess;
