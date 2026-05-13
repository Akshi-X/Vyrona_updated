import type { ReactNode, ElementType } from "react";
import PageHeader from "./PageHeader";

type PageLayoutProps = {
    title: string;
    icon?: string;
    iconAlt?: string;
    lucideIcon?: ElementType;
    actions?: ReactNode;
    children: ReactNode;
    hideHeaderOnDesktop?: boolean;
};

const PageLayout = ({ title, icon, iconAlt, lucideIcon, actions, children, hideHeaderOnDesktop = false }: PageLayoutProps) => {
    return (
        <main id="onboarding-page-layout" className="flex flex-col h-screen overflow-hidden page-enter">
            <div className={`${hideHeaderOnDesktop ? "md:hidden" : "md:px-6 md:pt-10 md:pb-6"} flex-shrink-0 px-4`}>
                <PageHeader title={title} icon={icon} iconAlt={iconAlt} lucideIcon={lucideIcon} actions={actions} />
            </div>
            <div className={`flex-1 p-4 ${hideHeaderOnDesktop ? "pt-0 md:pt-10" : "pt-4 md:pt-0"} md:p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0`}>
                {children}
            </div>
        </main>
    );
};

export default PageLayout;
