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
  const [selectedStatusInbound, setSelectedStatusInbound] = useState<string>('All');
  const [selectedStatusOutbound, setSelectedStatusOutbound] = useState<string>('All');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [department, setDepartment] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState<string>('');
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isCarrierDropdownOpen, setIsCarrierDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const carrierDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Active routes via API
  const [routes, setRoutes] = useState<ActiveRouteItem[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  // Active canisters via API
  const [canisters, setCanisters] = useState<Array<{
    id: string;
    canisterId: string;
    branchName: string;
    status: string;
    date: string;
  }>>([]);
  const [loadingCanisters, setLoadingCanisters] = useState(false);
  const [canistersError, setCanistersError] = useState<string | null>(null);
  const [zoomToLocation, setZoomToLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [zoomToBranchName, setZoomToBranchName] = useState<string | null>(null);
  const [mapRoutes, setMapRoutes] = useState<Array<{
    patient_id: string;
    source_latitude: number;
    source_longitude: number;
    destination_latitude: number;
    destination_longitude: number;
  }>>([]);

  // Read department from localStorage (set after OTP verification)
  useEffect(() => {
    try {
      const dept = localStorage.getItem('department');
      setDepartment(dept);
    } catch {
      setDepartment(null);
    }
  }, []);

  const isIvfUser = (department || '').toUpperCase() === 'IVF';
  const isCgtUser = (department || '').toUpperCase() === 'CGT';

  // Force IVF users to stay on inbound view
  useEffect(() => {
    if (isIvfUser && direction !== 'inbound') {
      setDirection('inbound');
    }
  }, [isIvfUser, direction]);

  // Force CGT users to stay on outbound view
  useEffect(() => {
    if (isCgtUser && direction !== 'outbound') {
      setDirection('outbound');
    }
  }, [isCgtUser, direction]);

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

  // Fetch map routes data for coordinates (outbound)
  useEffect(() => {
    const fetchMapRoutes = async () => {
      if (direction === 'outbound') {
        try {
          const data = await shipmentService.getControlTowerMapRoutes({
            region: selectedRegion !== 'All' ? selectedRegion : undefined,
            routeStatus: selectedStatusOutbound !== 'All' ? selectedStatusOutbound.toLowerCase() : undefined,
            carrier: selectedCarrier !== 'All' ? selectedCarrier : undefined,
          });
          setMapRoutes(data.map(r => ({
            patient_id: String(r.patient_id),
            source_latitude: r.source_latitude,
            source_longitude: r.source_longitude,
            destination_latitude: r.destination_latitude,
            destination_longitude: r.destination_longitude,
          })));
        } catch (e: any) {
          console.warn('Failed to load map routes:', e?.message);
          setMapRoutes([]);
        }
      }
    };
    if (isAuthenticated && direction === 'outbound') {
      fetchMapRoutes();
    }
  }, [isAuthenticated, direction, selectedRegion, selectedStatusOutbound, selectedCarrier]);

  useEffect(() => {
    const fetchCanisters = async () => {
      setLoadingCanisters(true);
      setCanistersError(null);
      try {
        const data = await shipmentService.getActiveCanisters();
        let flattenedCanisters: Array<{
          id: string;
          canisterId: string;
          branchName: string;
          status: string;
          date: string;
        }> = [];

        // Handle flat format (canisters array)
        if (data.canisters && Array.isArray(data.canisters)) {
          flattenedCanisters = data.canisters.map(canister => {
            // Normalize status
            let statusText = 'Safe';
            const status = canister.canister_status?.toLowerCase() || '';
            if (status === 'risk' || status === 'critical') {
              statusText = status === 'critical' ? 'Critical' : 'Risk';
            } else if (status === 'safe') {
              statusText = 'Safe';
            }

            // Format date - handle null updated_at
            let date = '-';
            if (canister.updated_at) {
              const d = new Date(canister.updated_at);
              if (!isNaN(d.getTime())) {
                date = d.toLocaleDateString('en-GB');
              }
            }

            return {
              id: `canister-${canister.canister_id}`,
              canisterId: String(canister.canister_id),
              branchName: 'N/A', // Flat format doesn't have branch info
              status: statusText,
              date: date,
            };
          });
        }
        // Handle nested format (branches with canisters)
        else if ((data as any).branches && Array.isArray((data as any).branches)) {
          flattenedCanisters = (data as any).branches.flatMap((branch: any) => 
            branch.canisters.map((canister: any) => {
              // Normalize status
              let statusText = 'Safe';
              const status = canister.canister_status?.toLowerCase() || '';
              if (status === 'risk' || status === 'critical') {
                statusText = status === 'critical' ? 'Critical' : 'Risk';
              } else if (status === 'safe') {
                statusText = 'Safe';
              }

              // Format date
              let date = '-';
              if (canister.updated_at) {
                const d = new Date(canister.updated_at);
                if (!isNaN(d.getTime())) {
                  date = d.toLocaleDateString('en-GB');
                }
              }

              return {
                id: `canister-${canister.canister_id}`,
                canisterId: String(canister.canister_id),
                branchName: branch.branch_name || 'N/A',
                status: statusText,
                date: date,
              };
            })
          );
        }

        setCanisters(flattenedCanisters);
      } catch (e: any) {
        setCanistersError(e?.message || 'Failed to load active canisters');
        setCanisters([]);
      } finally {
        setLoadingCanisters(false);
      }
    };
    if (isAuthenticated) fetchCanisters();
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

  // Build filter option lists from routes data
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => {
      if (r?.sourceRegion && r.sourceRegion.trim()) set.add(r.sourceRegion.trim());
      if (r?.destinationRegion && r.destinationRegion.trim()) set.add(r.destinationRegion.trim());
    });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  // Status options for inbound (from canisters)
  const statusOptionsInbound = useMemo(() => {
    const set = new Set<string>();
    canisters.forEach(c => { if (c?.status && String(c.status).trim()) set.add(String(c.status)); });
    return ['All', ...Array.from(set).sort()];
  }, [canisters]);

  // Status options for outbound (from routes)
  const statusOptionsOutbound = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r?.status && String(r.status).trim()) set.add(String(r.status)); });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  // Current status options based on direction
  const statusOptions = useMemo(() => {
    return direction === 'inbound' ? statusOptionsInbound : statusOptionsOutbound;
  }, [direction, statusOptionsInbound, statusOptionsOutbound]);

  const carrierOptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r?.supplyChain && r.supplyChain.trim()) set.add(r.supplyChain.trim()); });
    return ['All', ...Array.from(set).sort()];
  }, [routes]);

  // Build branch options from canisters data (for inbound)
  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    canisters.forEach(c => {
      if (c?.branchName && c.branchName.trim() && c.branchName !== 'N/A') {
        set.add(c.branchName.trim());
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [canisters]);

  // Apply filters to routes (outbound only)
  const filteredRoutes = useMemo(() => {
    return (routes || []).filter(r => {
      const matchRegion = selectedRegion === 'All' || 
        r.sourceRegion === selectedRegion || 
        r.destinationRegion === selectedRegion;
      const matchStatus = selectedStatusOutbound === 'All' || r.status === selectedStatusOutbound;
      const matchCarrier = selectedCarrier === 'All' || r.supplyChain === selectedCarrier;
      return matchRegion && matchStatus && matchCarrier;
    });
  }, [routes, selectedRegion, selectedStatusOutbound, selectedCarrier]);

  // Apply filters to canisters (inbound only)
  const filteredCanisters = useMemo(() => {
    return (canisters || []).filter(c => {
      const matchBranch = selectedBranch === 'All' || c.branchName === selectedBranch;
      const matchStatus = selectedStatusInbound === 'All' || c.status === selectedStatusInbound;
      return matchBranch && matchStatus;
    });
  }, [canisters, selectedBranch, selectedStatusInbound]);

  // Reset zoomToLocation after it's been used
  useEffect(() => {
    if (zoomToLocation || zoomToBranchName) {
      const timer = setTimeout(() => {
        setZoomToLocation(null);
        setZoomToBranchName(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [zoomToLocation, zoomToBranchName]);

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
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setIsBranchDropdownOpen(false);
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
    <div className="bg-[#FDFAFF] flex w-full" style={{ height: '100vh' }}>
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
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:grid-rows-[340px_544px] gap-6 min-h-0 items-start">
            {/* Left Panel - Filters and Routes */}
            <div className="flex flex-col gap-6 min-w-0">
              {/* Filters Section */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-[380px] flex-shrink-0 flex flex-col justify-center">
                <div className="flex flex-col gap-3">
                  {/* Direction Toggle - Only show for IVF department */}
                  {isIvfUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Direction
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDirection('inbound')}
                          className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                            direction === 'inbound'
                              ? 'bg-[#6b1176] text-white border-[#6b1176]'
                              : 'bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50'
                          }`}
                        >
                          Inbound
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isIvfUser) {
                              setDirection('outbound');
                            }
                          }}
                          disabled={isIvfUser}
                          className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                            direction === 'outbound'
                              ? 'bg-[#6b1176] text白 border-[#6b1176]'
                              : 'bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50'
                          } ${isIvfUser ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}
                        >
                          Outbound
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Branch Filter (Inbound only) */}
                  {direction === 'inbound' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Branch
                      </label>
                      <div className="relative" ref={branchDropdownRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsBranchDropdownOpen(!isBranchDropdownOpen);
                          }}
                          className="w-full px-3 h-12 border border-[#E7E1E1] rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#9c3aa6] focus:border-transparent bg-white"
                        >
                          <span className={selectedBranch !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                            {selectedBranch === 'All' ? 'All Branches' : selectedBranch}
                          </span>
                          <svg
                            className={`w-4 h-4 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isBranchDropdownOpen && (
                          <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                            {branchOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBranch(option);
                                  setIsBranchDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                  selectedBranch === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                                }`}
                              >
                                {option === 'All' ? 'All Branches' : option}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Region Filter (Outbound only) */}
                  {direction === 'outbound' && (
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
                  )}

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
                        <span className={(direction === 'inbound' ? selectedStatusInbound : selectedStatusOutbound) !== 'All' ? 'text-[#6b1176]' : 'text-gray-700'}>
                          {(direction === 'inbound' ? selectedStatusInbound : selectedStatusOutbound) === 'All' ? 'All Status' : (direction === 'inbound' ? selectedStatusInbound : selectedStatusOutbound)}
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
                          {statusOptions.map((option) => {
                            const currentStatus = direction === 'inbound' ? selectedStatusInbound : selectedStatusOutbound;
                            return (
                            <button
                              key={option}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                  if (direction === 'inbound') {
                                    setSelectedStatusInbound(option);
                                  } else {
                                    setSelectedStatusOutbound(option);
                                  }
                                setIsStatusDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-sm transition-colors duration-150 ${
                                  currentStatus === option ? 'bg-[#6b1176] text-white' : 'text-[#6b1176] hover:bg-gray-100'
                              }`}
                            >
                              {option === 'All' ? 'All Status' : option}
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Carrier Filter (Outbound only) */}
                  {direction === 'outbound' && (
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
                  )}
                </div>
              </div>

              {/* Active Routes List */}
              <div className={`bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] flex-shrink-0 flex flex-col overflow-hidden ${direction === 'inbound' ? 'h-[544px]' : 'h-[460px]'}`}>
                <h2 className="font-bold text-black text-base mb-2">
                  {direction === 'inbound' ? 'Active Canisters' : 'Active Routes'}
                </h2>
                <div className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3">
                  <div className="text-left">{direction === 'inbound' ? 'Canisters ID' : 'Routes ID'}</div>
                  <div className="text-left">Status</div>
                  <div className="text-left">Date</div>
                </div>
                <div 
                  className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                  style={{
                    scrollbarWidth: 'thin'
                  }}
                >
                  {(loadingRoutes || loadingCanisters) && (
                    <div className="p-4 text-xs text-gray-500">Loading...</div>
                  )}
                  {!loadingRoutes && !loadingCanisters && routesError && canistersError && (
                    <div className="p-4 text-xs text-red-600">{routesError}</div>
                  )}
                  {!loadingRoutes && !loadingCanisters && (!routesError || !canistersError) && (
                    <>
                      {/* Display Routes (Outbound only) */}
                      {direction === 'outbound' && filteredRoutes && filteredRoutes.length > 0 && (
                        filteredRoutes.map((route) => {
                      const statusText = route?.status || 'N/A';
                      const statusColor = statusText === 'Safe'
                        ? 'text-[#00B050]'
                        : statusText === 'Risk'
                          ? 'text-[#FF0000]'
                          : statusText === 'Delayed'
                            ? 'text-[#FFA500]'
                                : statusText === 'Critical'
                                  ? 'text-[#FF0000]'
                            : 'text-gray-500';
                      const handleRouteClick = (e: React.MouseEvent) => {
                        // Don't zoom if clicking on the link
                        if ((e.target as HTMLElement).tagName === 'A') {
                          return;
                        }
                        const mapRoute = mapRoutes.find(r => r.patient_id === route.patientId);
                        if (mapRoute) {
                          setZoomToLocation({
                            lat: mapRoute.source_latitude,
                            lng: mapRoute.source_longitude,
                          });
                        }
                      };

                      return (
                        <div 
                          key={route?.id ?? Math.random()} 
                          className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer"
                          onClick={handleRouteClick}
                        >
                          <div className="min-w-0 text-left overflow-hidden">
                            {route?.patientId ? (
                              <Link 
                                to={`/track/${route.patientId}`}
                                className="text-[#6b1176] text-xs font-bold hover:underline cursor-pointer truncate block"
                                onClick={(e) => e.stopPropagation()}
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
                      )}
                      {/* Display Canisters (Inbound only) */}
                      {direction === 'inbound' && filteredCanisters && filteredCanisters.length > 0 && (
                        filteredCanisters.map((canister) => {
                          const statusColor = canister.status === 'Safe'
                            ? 'text-[#00B050]'
                            : canister.status === 'Risk'
                              ? 'text-[#FF0000]'
                              : canister.status === 'Critical'
                                ? 'text-[#FF0000]'
                                : 'text-gray-500';
                          const handleCanisterClick = () => {
                            if (canister.branchName && canister.branchName !== 'N/A') {
                              setZoomToBranchName(canister.branchName);
                            }
                          };

                          return (
                            <div 
                              key={canister.id} 
                              className="grid grid-cols-[150px_70px_90px] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer"
                              onClick={handleCanisterClick}
                            >
                              <div className="min-w-0 text-left overflow-hidden">
                                <span className="text-[#6b1176] text-xs font-bold">
                                  Canister {canister.canisterId}
                                </span>
                                {canister.branchName && canister.branchName !== 'N/A' && (
                                  <div className="text-xs text-gray-900 leading-snug">
                                    <div className="truncate">{canister.branchName}</div>
                                  </div>
                                )}
                              </div>
                              <div className={`text-left text-xs font-medium ${statusColor}`}>{canister.status}</div>
                              <div className="text-left text-xs font-bold text-gray-600 truncate">{canister.date || '-'}</div>
                            </div>
                          );
                        })
                      )}
                      {direction === 'inbound' && (!filteredCanisters || filteredCanisters.length === 0) && (
                        <div className="p-4 text-xs text-gray-500">No active canisters found.</div>
                      )}
                      {direction === 'outbound' && (!filteredRoutes || filteredRoutes.length === 0) && (
                    <div className="p-4 text-xs text-gray-500">No active routes found.</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Map Visualization */}
            <div className="flex flex-col gap-6 min-w-0 w-full row-span-2">
              <ControlTowerMap 
                filters={{
                  selectedRegion,
                  selectedStatus: direction === 'inbound' ? selectedStatusInbound : selectedStatusOutbound,
                  selectedCarrier,
                  selectedBranch,
                }}
                direction={direction}
                zoomToLocation={zoomToLocation}
                zoomToBranchName={zoomToBranchName}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ControlTower;






