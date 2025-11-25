import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Sidebar } from '../../components/Sidebar';
import Header from '../../components/Header';
import { shipmentService, type ActiveRouteItem } from '../../services/shipmentService';
import ControlTowerMap from '../../components/ControlTowerMap';
import { Link } from 'react-router-dom';
import { userService } from '../../services/userService';

const ControlTower = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('All');
  const [userInitials, setUserInitials] = useState<string>('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCarrierDropdownOpen, setIsCarrierDropdownOpen] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const carrierDropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch user profile to compute initials
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
      } catch {
        setUserInitials('U');
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    }
  }, [isAuthenticated]);

  // Fetch user profile to compute initials
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
        setUserInitials(initials);
      } catch {
        setUserInitials('U');
      }
    };
    if (isAuthenticated) {
      fetchUserProfile();
    }
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(event.target as Node)) {
        setIsRegionDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (carrierDropdownRef.current && !carrierDropdownRef.current.contains(event.target as Node)) {
        setIsCarrierDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


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
              <span className="text-white text-xs font-semibold">{userInitials}</span>
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
                    <div className="relative" ref={regionDropdownRef}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRegionDropdownOpen(!isRegionDropdownOpen);
                        }}
                        className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                      >
                        <span className={selectedRegion !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                          {selectedRegion === 'All' ? 'All Regions' : selectedRegion}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform ${isRegionDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isRegionDropdownOpen && (
                        <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          {regionOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRegion(option);
                                setIsRegionDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                selectedRegion === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                              }`}
                            >
                              {option === 'All' ? 'All Regions' : option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <div className="relative" ref={statusDropdownRef}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStatusDropdownOpen(!isStatusDropdownOpen);
                        }}
                        className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                      >
                        <span className={selectedStatus !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                          {selectedStatus === 'All' ? 'All Status' : selectedStatus}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isStatusDropdownOpen && (
                        <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          {statusOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStatus(option);
                                setIsStatusDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                selectedStatus === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                              }`}
                            >
                              {option === 'All' ? 'All Status' : option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Carrier Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Carrier
                    </label>
                    <div className="relative" ref={carrierDropdownRef}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCarrierDropdownOpen(!isCarrierDropdownOpen);
                        }}
                        className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                      >
                        <span className={selectedCarrier !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                          {selectedCarrier === 'All' ? 'All Carriers' : selectedCarrier}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform ${isCarrierDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isCarrierDropdownOpen && (
                        <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          {carrierOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCarrier(option);
                                setIsCarrierDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                selectedCarrier === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                              }`}
                            >
                              {option === 'All' ? 'All Carriers' : option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Network Hubs removed per request */}
                </div>
              </div>

              {/* Active Routes List */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] h-[544px] flex-shrink-0 flex flex-col overflow-hidden">
                <h2 className="font-bold text-black text-base mb-2">Active Routes</h2>
                <div className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3">
                  <div className="text-left">Route</div>
                  <div className="text-left">Status</div>
                  <div className="text-left">Date</div>
                </div>
                <div 
                  className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                  style={{
                    scrollbarWidth: 'thin'
                  }}
                >
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


