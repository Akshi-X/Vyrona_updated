import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shipmentService, type ThreePLPlayer } from '../../../services/shipmentService';

export default function ThreePLTable() {
  const { patientId } = useParams();
  const [players, setPlayers] = useState<ThreePLPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch3PLPlayers = async () => {
      if (!patientId) {
        setError('Patient ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await shipmentService.get3PLPlayers(patientId);
        // Ensure null/undefined entries from backend are removed
        setPlayers((Array.isArray(data) ? data : []).filter(Boolean) as ThreePLPlayer[]);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch 3PL players');
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    fetch3PLPlayers();
  }, [patientId]);

  

  // Render time on first line and date on second line
  const renderDateTimeTwoLines = (dateTimeString: string) => {
    if (!dateTimeString) return 'N/A';
    try {
      const date = new Date(dateTimeString);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      const time = `${hours}:${minutes}`;
      const dateStr = `${day}/${month}/${year}`;
      return (
        <span className="whitespace-pre-wrap">
          {time}
          <br />
          {dateStr}
        </span>
      );
    } catch {
      return dateTimeString;
    }
  };

  // Format route from source and destination
  const formatRoute = (source: string, destination: string): string => {
    const insertNewlineAfterComma = (text?: string): string => {
      if (!text) return '';
      return text.replace(/,\s*/g, ',\n');
    };

    const src = insertNewlineAfterComma(source);
    const dest = insertNewlineAfterComma(destination);

    if (!src && !dest) return 'N/A';
    if (!src) return dest;
    if (!dest) return src;
    return `${src}–${dest}`;
  };

  return (
    <div className="rounded-[5px] border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900  text-[16px]">Logistics</h3>
        </div>
      </div>
      <div className="overflow-x-auto h-[254px] [scrollbar-width:thin] bg-[#F8F8F8]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        ) : players.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">No 3PL players found</p>
          </div>
        ) : (
          <div className="inline-block min-w-[760px] bg-white rounded-[5px]">
            <table className="table-fixed text-xs w-full">
              <thead className="bg-[#FDF4FF] text-[#6B1176] text-[12px] font-medium h-[56px] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px] rounded-tl-[10px]">3PL Player Name</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">Mode of Transport</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">Transport Route</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">Departure Time</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">Arrival Time</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">Handover Time</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px]">LN2 Refill</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap w-[140px] rounded-tr-[10px]">Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {players.filter(Boolean).map((player, i) => (
                  <tr key={i} className="text-black text-[14px] hover:bg-gray-50">
                    <td className="px-3 py-2 break-words w-[140px]">{player.player_name || 'N/A'}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{player.modes || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-pre-wrap break-words w-[140px]">{formatRoute(player.source, player.destination)}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{renderDateTimeTwoLines(player.departure_time)}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{renderDateTimeTwoLines(player.arrival_time)}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{renderDateTimeTwoLines(player.handover_time)}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{player.ln2_refill || 'N/A'}</td>
                    <td className="px-3 py-2 break-words w-[140px]">{player.warehouse || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


