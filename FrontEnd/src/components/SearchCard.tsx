import React from "react";

interface SearchCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}

/**
 * The white "select branch and device" card shared by the cryocan/incubator/
 * refrigerator tracking search pages. Sits centered inside TrackingPageShell.
 */
const SearchCard: React.FC<SearchCardProps> = ({ icon, title, description, children }) => {
    return (
        <div className="relative z-10 w-full max-w-[560px] mx-4 md:mx-0 rounded-[14px] border border-line bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
                {icon}
                <div>
                    <h2 className="text-[17px] md:text-[20px] font-semibold leading-none text-black">
                        {title}
                    </h2>
                    <p className="mt-2 text-xs text-[#5A5A5A]">{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
};

export default SearchCard;
