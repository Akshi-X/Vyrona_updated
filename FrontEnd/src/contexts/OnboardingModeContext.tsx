import React, { createContext, useContext } from "react";

const OnboardingModeContext = createContext(false);

export const OnboardingModeProvider: React.FC<{
    value: boolean;
    children: React.ReactNode;
}> = ({ value, children }) => {
    return (
        <OnboardingModeContext.Provider value={value}>
            {children}
        </OnboardingModeContext.Provider>
    );
};

export const useOnboardingMode = () => useContext(OnboardingModeContext);
