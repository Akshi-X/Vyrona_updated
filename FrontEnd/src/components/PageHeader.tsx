import type { ReactNode, ElementType } from "react";
import HamburgerButton from "./HamburgerButton";

type PageHeaderProps = {
    title: string;
    description?: string;
    icon?: string;
    iconAlt?: string;
    lucideIcon?: ElementType;
    actions?: ReactNode;
};

const PageHeader = ({ title, description, icon, iconAlt, lucideIcon: LucideIcon, actions }: PageHeaderProps) => {
    return (
        <div className="flex items-center justify-between sticky top-0 z-30 bg-surface -mx-4 px-4 py-3 md:static md:bg-transparent md:mx-0 md:px-0 md:py-0">
            <div className="flex items-center gap-2 md:gap-3">
                <HamburgerButton />
                {LucideIcon && <LucideIcon className="w-6 h-6 md:w-8 md:h-8 text-primary" />}
                {icon && !LucideIcon && (
                    <img src={icon} alt={iconAlt ?? title} className="w-6 h-6 md:w-8 md:h-8" />
                )}
                <div>
                    <h1 className="font-semibold text-black text-lg md:text-2xl leading-tight">{title}</h1>
                    {description && <p className="text-xs font-semibold text-primary mt-0.5 hidden md:block">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
};

export default PageHeader;
