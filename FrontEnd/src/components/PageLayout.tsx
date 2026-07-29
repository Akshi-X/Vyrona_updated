import type { ReactNode, ElementType } from "react";
import PageHeader from "./PageHeader";

type PageLayoutProps = {
    title: string;
    description?: string;
    icon?: string;
    iconAlt?: string;
    lucideIcon?: ElementType;
    actions?: ReactNode;
    children: ReactNode;
    hideHeaderOnDesktop?: boolean;
    /** Repeating refrigerator pattern behind the content (hospital-8 variant). */
    patternBackground?: boolean;
    /** Suppress the page-tour icon next to the title (e.g. Dashboard places it elsewhere). */
    hideTourButton?: boolean;
};

const PageLayout = ({ title, description, icon, iconAlt, lucideIcon, actions, children, hideHeaderOnDesktop = false, patternBackground = false, hideTourButton = false }: PageLayoutProps) => {
    return (
        <main id="onboarding-page-layout" className={`flex flex-col h-dvh overflow-hidden page-enter ${patternBackground ? "relative isolate" : ""}`}>
            {patternBackground && (
                <div
                    aria-hidden
                    className="absolute inset-0 -z-10 pointer-events-none"
                    style={{ backgroundImage: "url(/ivf_pattern.png)", backgroundSize: "20%", backgroundRepeat: "repeat", opacity: 0.35 }}
                />
            )}
            <div className={`${hideHeaderOnDesktop ? "md:hidden" : "md:px-6 md:pt-10 md:pb-6"} flex-shrink-0 px-4`}>
                <PageHeader title={title} description={description} icon={icon} iconAlt={iconAlt} lucideIcon={lucideIcon} actions={actions} hideTourButton={hideTourButton} />
            </div>
            <div className={`flex-1 p-4 ${hideHeaderOnDesktop ? "pt-0 md:pt-10" : "pt-4 md:pt-0"} md:p-6 flex flex-col gap-4 overflow-y-auto overflow-x-hidden min-h-0`}>
                {children}
            </div>
        </main>
    );
};

export default PageLayout;
