import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../../components/Sidebar';
import Header from '../../components/Header';
import { shipmentService, type ActiveRouteItem } from '../../services/shipmentService';
import ControlTowerMap from '../../components/ControlTowerMap';
import { Link } from 'react-router-dom';

const ControlTower = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('All');

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

  // Build filter option lists from routes data
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => {
      if (r?.sourceRegion && r.sourceRegion.trim()) set.add(r.sourceRegion.trim());
      if (r?.destinationRegion && r.destinationRegion.trim()) set.add(r.destinationRegion.trim());
    });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r?.status && String(r.status).trim()) set.add(String(r.status)); });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  const carrierOptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r?.supplyChain && r.supplyChain.trim()) set.add(r.supplyChain.trim()); });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  // Apply filters to routes
  const filteredRoutes = useMemo(() => {
    return (routes || []).filter(r => {
      const matchRegion = selectedRegion === 'All' || 
        r.sourceRegion === selectedRegion || 
        r.destinationRegion === selectedRegion;
      const matchStatus = selectedStatus === 'All' || r.status === selectedStatus;
      const matchCarrier = selectedCarrier === 'All' || r.supplyChain === selectedCarrier;
      return matchRegion && matchStatus && matchCarrier;
    });
  }, [routes, selectedRegion, selectedStatus, selectedCarrier]);


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
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0" style={{ paddingTop: 'calc(63px + 1rem)' }}>
          <h1 className="font-semibold text-black text-2xl">
            Control Tower
          </h1>

          {/* Main Content Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:grid-rows-[280px_544px] gap-6 min-h-0 items-start">
            {/* Left Panel - Filters and Routes */}
            <div className="flex flex-col gap-6 min-w-0">
              {/* Filters Section */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-[380px] h-[280px] flex-shrink-0 flex flex-col justify-center">
                <div className="flex flex-col gap-3">
                  {/* Region Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Region
                    </label>
                     <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      {regionOptions.map(o => (
                        <option key={o} value={o}>{o === 'All' ? 'All Regions' : o}</option>
                      ))}
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
                      className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      {statusOptions.map(o => (
                        <option key={o} value={o}>{o === 'All' ? 'All Status' : o}</option>
                      ))}
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
                      className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent"
                    >
                      {carrierOptions.map(o => (
                        <option key={o} value={o}>{o === 'All' ? 'All Carriers' : o}</option>
                      ))}
                    </select>
                  </div>

                  {/* Network Hubs removed per request */}
                </div>
              </div>

              {/* Active Routes List */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] h-[544px] flex-shrink-0 flex flex-col overflow-hidden">
                <h2 className="font-bold text-black text-base mb-2">Active Routes</h2>
                <div className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-gray-900 gap-3">
                  <div className="text-left">Route</div>
                  <div className="text-left">Status</div>
                  <div className="text-left">Date</div>
                </div>
                <div className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100">
                  {loadingRoutes && (
                    <div className="p-4 text-xs text-gray-500">Loading routes...</div>
                  )}
                  {!loadingRoutes && routesError && (
                    <div className="p-4 text-xs text-red-600">{routesError}</div>
                  )}
                  {!loadingRoutes && !routesError && (filteredRoutes && filteredRoutes.length > 0 ? (
                    (filteredRoutes || []).map((route) => {
                      const statusText = route?.status || 'N/A';
                      const statusColor = statusText === 'Safe'
                        ? 'text-[#00B050]'
                        : statusText === 'Risk'
                          ? 'text-[#FF0000]'
                          : statusText === 'Delayed'
                            ? 'text-[#FFA500]'
                            : 'text-gray-500';
                      return (
                        <div key={route?.id ?? Math.random()} className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3">
                          <div className="min-w-0 text-left overflow-hidden">
                            {route?.patientId ? (
                              <Link 
                                to={`/track/${route.patientId}`}
                                className="text-[#6b1176] text-xs font-bold hover:underline cursor-pointer truncate block"
                              >
                                {route.patientId}
                              </Link>
                            ) : (
                              <span className="text-[#6b1176] text-xs font-bold">N/A</span>
                            )}
                            <div 
                              className="text-xs text-gray-900 leading-snug"
                              title={(route?.origin && route?.destination) 
                                ? `${route.origin} → ${route.destination}` 
                                : (route?.routeText || '')}
                            >
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
                              <div className="text-[10px] text-gray-400 truncate">{route?.supplyChain}</div>
                            )}
                          </div>
                          <div className={`text-left text-xs font-medium ${statusColor}`}>{statusText}</div>
                          <div className="text-left text-xs font-bold text-gray-600 truncate">{route?.date || '-'}</div>
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


