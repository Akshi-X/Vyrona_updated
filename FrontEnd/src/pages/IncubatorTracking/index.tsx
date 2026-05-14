import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Thermometer } from 'lucide-react';
import IncubatorQualityTrackingIcon from '../../assets/DashBoardIcons/IncubatorQualityTracking.svg';
import PageLayout from '../../components/PageLayout';
import { ivfService } from '../../services/ivfService';

interface IncubatorCardItem {
  incubator_id: number;
  label: string;
  branchName: string;
}

export default function IncubatorTrackingDashboardPage() {
  const navigate = useNavigate();
  const [incubators, setIncubators] = useState<IncubatorCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIncubators = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await ivfService.getActiveIncubators();
        const items: IncubatorCardItem[] = [];
        for (const branch of res.branches) {
          for (const inc of branch.incubators) {
            items.push({
              incubator_id: inc.incubator_id,
              label: inc.incubator_code || `I${inc.incubator_id}`,
              branchName: branch.branch_name,
            });
          }
        }
        setIncubators(items);
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to load incubators');
        setIncubators([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIncubators();
  }, []);

  return (
    <PageLayout title="Incubator Tracking" lucideIcon={Thermometer}>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#9c3aa6] border-t-transparent" />
        </div>
      )}
      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {incubators.map((inc) => (
            <button
              key={inc.incubator_id}
              type="button"
              onClick={() => navigate(`/incubator-tracking/${inc.incubator_id}`)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-[#9c3aa6]/30 transition-all duration-200 overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:ring-offset-2"
            >
              <div className="aspect-4/3 bg-linear-to-br from-[#FDFAFF] to-[#f3e8f7] flex items-center justify-center p-4">
                <img
                  src={IncubatorQualityTrackingIcon}
                  alt=""
                  className="w-16 h-16 opacity-80"
                />
              </div>
              <div className="p-4">
                <p className="font-semibold text-gray-900 mt-1">{inc.label}</p>
                <p className="text-sm text-gray-600">{inc.branchName}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && !error && incubators.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          No incubators found. Data will appear when available.
        </div>
      )}
    </PageLayout>
  );
}
