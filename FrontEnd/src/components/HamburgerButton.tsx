import { useSidebar } from "../contexts/SidebarContext";

const HamburgerButton = () => {
    const { toggleMobile } = useSidebar();

    return (
        <button
            type="button"
            onClick={toggleMobile}
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[5px] rounded-lg hover:bg-black/5 transition-colors"
            aria-label="Toggle navigation menu"
        >
            <span className="block w-5 h-0.5 bg-gray-700 rounded-full" />
            <span className="block w-5 h-0.5 bg-gray-700 rounded-full" />
            <span className="block w-5 h-0.5 bg-gray-700 rounded-full" />
        </button>
    );
};

export default HamburgerButton;
