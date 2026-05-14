import DarkApheresisIcon from '../../../assets/TrackAndTraceIcons/DarkApheresis.svg';
import LightApheresisIcon from '../../../assets/TrackAndTraceIcons/LightApheresis.svg';
import DarkCryopreservationIcon from '../../../assets/TrackAndTraceIcons/DarkCryopreservation.svg';
import LightCryopreservationIcon from '../../../assets/TrackAndTraceIcons/LightCryopreservation.svg';
import DarkTransportationIcon from '../../../assets/TrackAndTraceIcons/DarkTransportation.svg';
import LightTransportationIcon from '../../../assets/TrackAndTraceIcons/LightTransportation.svg';
import DarkPostReIcon from '../../../assets/TrackAndTraceIcons/DarkPost-Reengineering.svg';
import PostReIcon from '../../../assets/TrackAndTraceIcons/Post-Reengineering.svg';
import DarkReinfusionIcon from '../../../assets/TrackAndTraceIcons/DarkReinfusion.svg';
import ReinfusionIcon from '../../../assets/TrackAndTraceIcons/Reinfusion.svg';

// For IVF, the steps are: Apheresis, Cryopreservation, Transportation, Bioengineering, Cryopreservation, Transportation, Notification
const ivfSteps = [
  { key: 'Apheresis', dark: DarkApheresisIcon, light: LightApheresisIcon },
  { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
  { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
  { key: 'Bioengineering', dark: DarkPostReIcon, light: PostReIcon },
  { key: 'Cryopreservation', dark: DarkCryopreservationIcon, light: LightCryopreservationIcon },
  { key: 'Transportation', dark: DarkTransportationIcon, light: LightTransportationIcon },
  { key: 'Notification', dark: DarkReinfusionIcon, light: ReinfusionIcon },
];

export default function ContainerProcessFlow() {
  // Mock: Current stage is at index 2 (Transportation)
  const currentIndex = 2;

  return (
    <div className="bg-white border border-line rounded-lg p-4 pb-8 px-[40px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0 w-full">
          {ivfSteps.map((s, idx) => {
            const isCompleted = idx < currentIndex;
            const isActive = idx === currentIndex;
            const isCurrentOrUpcoming = idx >= currentIndex;
            const circleBg = (isCompleted || isActive) ? '#8d2b8f' : '#f6e9f8';
            const labelColor = (isCompleted || isActive) ? 'text-gray-700' : 'text-gray-500';
            const icon = (isCompleted || isActive) ? s.dark : s.light;
            
            const connector = (() => {
              if (idx === ivfSteps.length - 1) return null;
              if (idx < currentIndex - 1) return <div className="h-[2px] bg-[#8d2b8f] rounded-full flex-1" />;
              if (idx === currentIndex - 1) return (
                <div className="flex-1">
                  <div className="w-full h-[2px] bg-[repeating-linear-gradient(90deg,_#8d2b8f,_#8d2b8f_6px,_transparent_6px,_transparent_12px)] rounded-full opacity-70" />
                </div>
              );
              return <div className="h-[2px] bg-[#f1dff5] rounded-full flex-1" />;
            })();

            const containerClass = idx === ivfSteps.length - 1
              ? 'flex items-center gap-0'
              : 'flex items-center gap-0 flex-1';

            return (
              <div className={containerClass} key={`${s.key}-${idx}`}>
                <div className="relative flex flex-col items-center w-9 my-2 shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: circleBg }}>
                    <img src={icon} alt={s.key} className={`w-4 h-4 ${isCurrentOrUpcoming ? 'opacity-80' : ''}`} />
                  </div>
                  <div className={`absolute top-full font-semibold mt-2 text-[12px] ${labelColor} text-center whitespace-nowrap`}>
                    {s.key}
                  </div>
                </div>
                {connector}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
