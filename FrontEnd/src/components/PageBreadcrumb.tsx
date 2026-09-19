import { useNavigate } from "react-router-dom";

interface PageBreadcrumbProps {
    label: string;
}

/** "Dashboard / {label}" breadcrumb shared by the cryocan/incubator/refrigerator
 * tracking detail pages. */
const PageBreadcrumb: React.FC<PageBreadcrumbProps> = ({ label }) => {
    const navigate = useNavigate();

    return (
        <div className="flex items-center gap-1 text-sm">
            <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
            >
                Dashboard
            </button>
            <span className="text-gray-500">/</span>
            <span className="text-black font-semibold">{label}</span>
        </div>
    );
};

export default PageBreadcrumb;
