import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../../components/Sidebar';
import Header from '../../components/Header';
import { shipmentService, type ActiveRouteItem } from '../../services/shipmentService';
import ControlTowerMap from '../../components/ControlTowerMap';

const ControlTower = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('All');
  const [networkHubsEnabled, setNetworkHubsEnabled] = useState<boolean>(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Active routes via API
  const [routes, setRoutes] = useState<ActiveRouteItem[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoadingRoutes(true);
      setRoutesError(null);
      try {
        const data = await shipmentService.getActiveRoutes();
        setRoutes(data);
      } catch (e: any) {
        setRoutesError(e?.message || 'Failed to load active routes');
        setRoutes([]);
      } finally {
        setLoadingRoutes(false);
      }
    };
    if (isAuthenticated) fetchRoutes();
  }, [isAuthenticated]);

  // Add 5 more rows based on present values (for demo/population)
  const augmentedRoutes = useMemo(() => {
    if (!routes || routes.length === 0) return [] as ActiveRouteItem[];
    const result: ActiveRouteItem[] = [...routes];
    for (let i = 0; i < 5; i++) {
      const base = routes[i % routes.length];
      result.push({
        ...base,
        id: `${base.id}-x${i + 1}`,
      });
    }
    return result;
  }, [routes]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Safe':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Risk':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'Delayed':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'Safe':
        return 'bg-green-500';
      case 'Risk':
        return 'bg-red-500';
      case 'Delayed':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  // map color helper not needed here

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access Control Tower.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      {/* Left Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        <Header
          title=""
          showBackButton={false}
          className=""
          offsetLeft="15rem"
          rightContent={(
            <div 
              className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
              onClick={() => navigate('/user-profile')}
              title="Go to User Profile"
            >
              <span className="text-white text-xs font-semibold">MV</span>
            </div>
          )}
        />

        {/* Control Tower Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0" style={{ paddingTop: 'calc(63px + 1rem)' }}>
          <h1 className="font-semibold text-black text-2xl">
            Control Tower
          </h1>

          {/* Main Content Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[453px_1fr] lg:grid-rows-[380px_464px] gap-6 min-h-0 items-start">
            {/* Left Panel - Filters and Routes */}
            <div className="flex flex-col gap-6 min-w-0">
              {/* Filters Section */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg px-4 pt-4 pb-2 w-[453px] h-[380px] flex-shrink-0">
                <h2 className="font-bold text-black text-lg mb-4">Filters</h2>
                <div className="flex flex-col gap-2">
                  {/* Region Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Region
                    </label>
                     <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="w-full px-3 h-11 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      <option value="All">All Regions</option>
                      <option value="North">North</option>
                      <option value="South">South</option>
                      <option value="East">East</option>
                      <option value="West">West</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                     <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full px-3 h-11 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      <option value="All">All Status</option>
                      <option value="Safe">Safe</option>
                      <option value="Risk">Risk</option>
                      <option value="Delayed">Delayed</option>
                    </select>
                  </div>

                  {/* Carrier Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Carrier
                    </label>
                     <select
                      value={selectedCarrier}
                      onChange={(e) => setSelectedCarrier(e.target.value)}
                      className="w-full px-3 h-11 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      <option value="All">All Carriers</option>
                      <option value="FedEx">FedEx</option>
                      <option value="UPS">UPS</option>
                      <option value="DHL">DHL</option>
                    </select>
                  </div>

                  {/* Network Hubs Filter (single toggle) */}
                  <div className="my-auto">
                    <div className="flex items-center justify-between h-11">
                      <label className="block text-sm font-medium text-black leading-none">
                        Network Hubs
                      </label>
                      <button
                        onClick={() => setNetworkHubsEnabled((v) => !v)}
                        aria-label="Toggle Network Hubs"
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          networkHubsEnabled ? 'bg-[#9c3aa6]' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                          networkHubsEnabled ? 'translate-x-4' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Routes List */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg p-4 w-[453px] h-[464px] flex-shrink-0 flex flex-col">
                <h2 className="font-bold text-black text-lg mb-3">Active Routes</h2>
                <div className="grid grid-cols-[1fr_84px_110px] justify-items-start gap-4 px-4 py-3 rounded-t-lg bg-[#F7ECFF] text-[12px] text-gray-700">
                  <div className="text-left">Route</div>
                  <div className="text-left justify-self-start">Status</div>
                  <div className="text-left justify-self-start">Date</div>
                </div>
                <div className="flex-1 overflow-y-auto mt-1 divide-y divide-gray-100">
                  {loadingRoutes && (
                    <div className="p-4 text-xs text-gray-500">Loading routes...</div>
                  )}
                  {!loadingRoutes && routesError && (
                    <div className="p-4 text-xs text-red-600">{routesError}</div>
                  )}
                  {!loadingRoutes && !routesError && (augmentedRoutes && augmentedRoutes.length > 0 ? (
                    (augmentedRoutes || []).map((route) => {
                      const statusText = route?.status || 'N/A';
                      const statusColor = statusText === 'Safe'
                        ? 'text-[#00B050]'
                        : statusText === 'Risk'
                          ? 'text-[#FF0000]'
                          : statusText === 'Delayed'
                            ? 'text-[#FFA500]'
                            : 'text-gray-500';
                      return (
                        <div key={route?.id ?? Math.random()} className="grid grid-cols-[1fr_84px_110px] justify-items-start gap-4 items-center px-4 py-3 hover:bg-gray-50">
                          <div className="min-w-0">
                            <button className="text-[#6b1176] text-xs font-bold hover:underline">{route?.patientId || 'N/A'}</button>
                            <div className="text-sm text-gray-900 leading-snug">
                              {(route?.origin && route?.destination) ? (
                                <>
                                  <div className="truncate">{route?.origin || '-'}</div>
                                  <div className="truncate">→ {route?.destination || '-'}</div>
                                </>
                              ) : (
                                <div className="truncate">{route?.routeText || '-'}</div>
                              )}
                            </div>
                            {route?.supplyChain && (
                              <div className="text-[11px] text-gray-400 truncate">{route?.supplyChain}</div>
                            )}
                          </div>
                          <div className={`text-left text-xs font-medium justify-self-start ${statusColor}`}>{statusText}</div>
                          <div className="text-left text-xs font-bold text-gray-600 justify-self-start">{route?.date || '-'}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-xs text-gray-500">No active routes found.</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Map Visualization */}
            <div className="flex flex-col gap-6 min-w-0 w-full row-span-2">
              <ControlTowerMap />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ControlTower;
