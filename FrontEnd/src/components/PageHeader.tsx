import type { ReactNode, ElementType } from "react";
import { ChevronRight } from "lucide-react";
import HamburgerButton from "./HamburgerButton";
import TourEntryButton from "./TourEntryButton";

type PageHeaderProps = {
    title: string;
    description?: string;
    icon?: string;
    iconAlt?: string;
    lucideIcon?: ElementType;
    actions?: ReactNode;
    /** Suppress the page-tour icon next to the title (e.g. Dashboard places it elsewhere). */
    hideTourButton?: boolean;
    /** Small pill rendered next to the title, e.g. "Beta". */
    titleBadge?: string;
    /** Extra title text rendered after the badge, e.g. "| HIS: ABC123". */
    titleSuffix?: string;
};

const PageHeader = ({ title, description, icon, iconAlt, lucideIcon: LucideIcon, actions, hideTourButton, titleBadge, titleSuffix }: PageHeaderProps) => {
    return (
        <div className="flex items-center justify-between sticky top-0 z-30 bg-surface -mx-4 px-4 py-3 md:static md:bg-transparent md:mx-0 md:px-0 md:py-0">
            <div className="flex items-center gap-2 md:gap-3">
                <HamburgerButton />
                {LucideIcon && <LucideIcon className="w-6 h-6 md:w-8 md:h-8 text-primary" />}
                {icon && !LucideIcon && (
                    <img src={icon} alt={iconAlt ?? title} className="w-6 h-6 md:w-8 md:h-8" />
                )}
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="font-semibold text-black text-lg md:text-2xl leading-tight">{title}</h1>
                        {titleBadge && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                                {titleBadge}
                            </span>
                        )}
                        {titleSuffix && (
                            <>
                                <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-gray-300 shrink-0" />
                                <span
                                    className="font-medium text-primary text-sm md:text-base leading-tight rounded-md px-2 py-0.5"
                                    style={{ backgroundColor: "#F3EAF5" }}
                                >
                                    {titleSuffix}
                                </span>
                            </>
                        )}
                        {!hideTourButton && <TourEntryButton />}
                    </div>
                    {description && <p className="text-xs font-semibold text-primary mt-0.5 hidden md:block">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
};

export default PageHeader;
