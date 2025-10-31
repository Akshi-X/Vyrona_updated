import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from '../../components/Sidebar';
import Header from '../../components/Header';

interface Route {
  id: string;
  routeName: string;
  origin: string;
  destination: string;
  carrier: string;
  status: 'Safe' | 'Risk' | 'Delayed';
  lastUpdated: string;
}

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

  // Sample routes data
  const [routes] = useState<Route[]>([
    {
      id: '1',
      routeName: 'Route A1',
      origin: 'New York Hub',
      destination: 'Chicago Hub',
      carrier: 'FedEx',
      status: 'Safe',
      lastUpdated: '2 mins ago'
    },
    {
      id: '2',
      routeName: 'Route B2',
      origin: 'Los Angeles Hub',
      destination: 'San Francisco Hub',
      carrier: 'UPS',
      status: 'Risk',
      lastUpdated: '5 mins ago'
    },
    {
      id: '3',
      routeName: 'Route C3',
      origin: 'Miami Hub',
      destination: 'Atlanta Hub',
      carrier: 'DHL',
      status: 'Delayed',
      lastUpdated: '15 mins ago'
    },
    {
      id: '4',
      routeName: 'Route D4',
      origin: 'Seattle Hub',
      destination: 'Portland Hub',
      carrier: 'FedEx',
      status: 'Safe',
      lastUpdated: '1 min ago'
    },
    {
      id: '5',
      routeName: 'Route E5',
      origin: 'Boston Hub',
      destination: 'Philadelphia Hub',
      carrier: 'UPS',
      status: 'Safe',
      lastUpdated: '3 mins ago'
    },
  ]);

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

  const getRouteLineColor = (status: string) => {
    switch (status) {
      case 'Safe':
        return '#22c55e'; // green-500
      case 'Risk':
        return '#ef4444'; // red-500
      case 'Delayed':
        return '#eab308'; // yellow-500
      default:
        return '#6b7280'; // gray-500
    }
  };

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
                <div className="grid grid-cols-[1fr_84px_110px] gap-4 px-4 py-3 rounded-t-lg bg-[#F7ECFF] text-[12px] text-gray-700">
                  <div>Route</div>
                  <div className="text-center">Status</div>
                  <div className="text-right">Date</div>
                </div>
                <div className="flex-1 overflow-y-auto mt-1 divide-y divide-gray-100">
                  {routes.map((route) => {
                    const parsed = new Date(route.lastUpdated);
                    const displayDate = isNaN(parsed.getTime()) ? new Date().toLocaleDateString('en-GB') : parsed.toLocaleDateString('en-GB');
                    const statusColor = route.status === 'Safe' ? 'text-[#00B050]' : route.status === 'Risk' ? 'text-[#FF0000]' : 'text-[#FFA500]';
                    return (
                      <div key={route.id} className="grid grid-cols-[1fr_84px_110px] gap-4 items-center px-4 py-3 hover:bg-gray-50">
                        <div className="min-w-0">
                          <button className="text-[#6b1176] text-xs font-bold hover:underline">{route.id}</button>
                          <div className="text-sm text-gray-900 leading-snug">
                            <div className="truncate">{route.origin}</div>
                            <div className="truncate">→ {route.destination}</div>
                          </div>
                          <div className="text-[11px] text-gray-400">{route.carrier} Supply Chain</div>
                        </div>
                        <div className={`text-center text-xs font-medium ${statusColor}`}>{route.status}</div>
                        <div className="text-right text-xs font-bold text-gray-600">{displayDate}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden">
                  {routes.map((route) => (
                    <div key={route.id} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-1 py-3 border-b border-gray-50 hover:bg-gray-50">
                      {/* Route column */}
                      <div className="min-w-0">
                        <button className="text-[#6b1176] text-xs font-semibold hover:underline">
                          {route.id}
                        </button>
                        <div className="text-sm text-gray-900 truncate">
                          {route.origin}   a a→ {route.destination}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {route.carrier} Supply Chain
                        </div>
                      </div>
                      {/* Status column */}
                      <div className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-full border ${getStatusColor(route.status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(route.status)}`} />
                          {route.status}
                        </span>
                      </div>
                      {/* Date column */}
                      <div className="text-right text-xs font-semibold text-gray-600">
                        {route.lastUpdated}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Map Visualization */}
            <div className="flex flex-col gap-6 min-w-0 w-full row-span-2">
              {/* Map Container with embedded Network Status */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg relative overflow-hidden w-full h-[400px] lg:min-w-[674px] lg:h-[868px]">
                <div className="absolute inset-0 bg-black">
                  {/* Map Placeholder - Can be replaced with React Leaflet or other map library */}
                  <div className="w-full h-full relative">
                    {/* Network Status overlay (top-right) */}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm border border-[#E7E1E1] rounded-lg px-3 py-2 shadow-sm">
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-xs text-gray-700">Operational</span>
                        </div>
                        <div className="text-[10px] text-gray-500">{new Date().toLocaleTimeString()}</div>
                      </div>
                    </div>
                    {/* Simulated map background */}
                    <div className="absolute inset-0 opacity-20">
                      <svg viewBox="0 0 800 600" className="w-full h-full">
                        {/* Simulated map paths/lines */}
                        <path
                          d="M 100 150 Q 200 100 350 120 T 600 150"
                          stroke="#22c55e"
                          strokeWidth="3"
                          fill="none"
                          opacity="0.8"
                        />
                        <path
                          d="M 150 300 Q 300 250 450 280 T 650 300"
                          stroke="#ef4444"
                          strokeWidth="3"
                          fill="none"
                          opacity="0.8"
                        />
                        <path
                          d="M 200 450 Q 350 400 500 430 T 700 450"
                          stroke="#eab308"
                          strokeWidth="3"
                          fill="none"
                          opacity="0.8"
                        />
                        {/* Hub markers */}
                        <circle cx="100" cy="150" r="8" fill="#22c55e" />
                        <circle cx="600" cy="150" r="8" fill="#22c55e" />
                        <circle cx="150" cy="300" r="8" fill="#ef4444" />
                        <circle cx="650" cy="300" r="8" fill="#ef4444" />
                        <circle cx="200" cy="450" r="8" fill="#eab308" />
                        <circle cx="700" cy="450" r="8" fill="#eab308" />
                      </svg>
                    </div>
                    {/* Map overlay text */}
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs">
                      <span className="bg-black/50 px-2 py-1 rounded">Interactive Map</span>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span>Safe</span>
                        </div>
                        <div className="flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                          <div className="w-2 h-2 bg-red-500 rounded-full" />
                          <span>Risk</span>
                        </div>
                        <div className="flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                          <span>Delayed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ControlTower;
