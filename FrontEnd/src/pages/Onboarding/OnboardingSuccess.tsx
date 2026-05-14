import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "../../components/Header";

const OnboardingSuccess: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation() as { state?: any };
    const ticketId = location.state?.ticketId;
    const ticketNumber = location.state?.ticketNumber;

    return (
        <div className="min-h-screen bg-gray-50">
            <Header title="" showBackButton={false} />

            <div className="flex items-center justify-center min-h-screen" style={{ paddingTop: "calc(63px + 1rem)" }}>
                <div id="onboarding-success-card" className="bg-white rounded-lg shadow-lg p-12 max-w-2xl w-full mx-4">
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
                            className="w-full bg-[#6b1176] text-white py-4 px-6 rounded-lg font-medium hover:bg-[#8a2a95] transition-colors duration-200"
                        >
                            Go to Dashboard
                        </button>
                        <button
                            id="onboarding-success-profile-btn"
                            onClick={() => navigate("/onboarding/user-profile")}
                            className="w-full border border-[#6b1176] text-[#6b1176] py-4 px-6 rounded-lg font-medium hover:bg-purple-50 transition-colors duration-200"
                        >
                            Go to Profile
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default OnboardingSuccess;
