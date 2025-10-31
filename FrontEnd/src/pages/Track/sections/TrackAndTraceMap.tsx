import mapImage from '../../../assets/mapimg.png';

export default function TrackAndTraceMap() {
  return (
    <div className="w-full h-48 rounded overflow-hidden border border-[#E7E1E1] h-[290px]">
      {/* Placeholder image-style map; integrate real map later (Mapbox/Leaflet) */}
      <div
        className="w-full h-full bg-cover bg-center flex items-center justify-center text-gray-400"
        style={{ backgroundImage: `url(${mapImage})` }}
      >
        <span className="text-xs">Map placeholder</span>
      </div>
    </div>
  );
}


