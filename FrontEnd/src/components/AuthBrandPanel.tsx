import MyGrapeBanner from "../assets/Isolation_Mode.svg";
import MyGrapeLogo from "../assets/mGScale.svg";

export default function AuthBrandPanel() {
    return (
        <aside
            className="w-[35%] h-screen flex flex-col justify-between text-white relative overflow-hidden
             bg-gradient-to-b  from-[#7b2f83] to-[#29053f]
             rounded-tr-[40px] rounded-br-[40px]"
        >
            <div className="absolute inset-0 flex items-center justify-center z-0 overflow-hidden">
                <img
                    src={MyGrapeBanner}
                    className="w-full h-auto max-h-full object-contain"
                    alt="banner"
                />
            </div>

            <div className="flex h-[15%] items-center space-x-2 p-12 pb-0 relative z-10">
                <img src={MyGrapeLogo} alt="logo" className="w-[150px] h-[100px]" />
            </div>

            <div className="flex-1 relative z-0"></div>

            <div className="flex flex-col h-[20%] justify-end pt-0 p-12 pr-0 relative z-10">
                <h2 className="text-2xl font-bold leading-snug mt-8">
                    <span className="text-[#D951E6]">Driving Health Forward</span> <br />
                    One Smart Solution At a Time
                </h2>
                <p className="mt-1 font-[12px] text-white">
                    Because every patient is someone's everything.
                </p>
            </div>
        </aside>
    );
}
