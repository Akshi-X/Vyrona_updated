import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { userService } from '../../services/userService';
import { type IVFTreatment } from '../../types/ivf';

interface EmbryoGradingDetail {
  grade: string;
  description: string;
  blastocystFormation: string;
  innerCellMass: string;
  trophectoderm: string;
  expansion: string;
  viability: string;
  recommendations: string[];
}

export default function EmbryoGradingPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [userInitials, setUserInitials] = useState<string>('U');
  const [embryos, setEmbryos] = useState<IVFTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedEmbryo, setSelectedEmbryo] = useState<IVFTreatment | null>(null);
  const [direction, setDirection] = useState<'fresh' | 'frozen'>('fresh');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Mock embryo grading details data
  const getEmbryoGradingDetails = (grade: string): EmbryoGradingDetail => {
    const gradingData: Record<string, EmbryoGradingDetail> = {
      '4AA': {
        grade: '4AA',
        description: 'Excellent quality blastocyst with perfect inner cell mass and trophectoderm morphology.',
        blastocystFormation: 'Fully expanded blastocyst (Grade 4)',
        innerCellMass: 'Very cohesive, many cells, tightly packed (Grade A)',
        trophectoderm: 'Many cells, forming cohesive layer (Grade A)',
        expansion: 'Fully expanded with thin zona pellucida',
        viability: 'Highest implantation potential',
        recommendations: [
          'Excellent candidate for transfer',
          'Consider single embryo transfer',
          'High success rate expected',
          'Can be vitrified for future use'
        ]
      },
      '4AB': {
        grade: '4AB',
        description: 'Very good quality blastocyst with excellent inner cell mass but slightly less optimal trophectoderm.',
        blastocystFormation: 'Fully expanded blastocyst (Grade 4)',
        innerCellMass: 'Very cohesive, many cells, tightly packed (Grade A)',
        trophectoderm: 'Few cells, loosely grouped (Grade B)',
        expansion: 'Fully expanded with thin zona pellucida',
        viability: 'Very high implantation potential',
        recommendations: [
          'Very good candidate for transfer',
          'Consider for single embryo transfer',
          'Good success rate expected',
          'Suitable for vitrification'
        ]
      },
      '4BA': {
        grade: '4BA',
        description: 'Good quality blastocyst with excellent trophectoderm but slightly less optimal inner cell mass.',
        blastocystFormation: 'Fully expanded blastocyst (Grade 4)',
        innerCellMass: 'Loosely grouped, several cells (Grade B)',
        trophectoderm: 'Many cells, forming cohesive layer (Grade A)',
        expansion: 'Fully expanded with thin zona pellucida',
        viability: 'High implantation potential',
        recommendations: [
          'Good candidate for transfer',
          'May consider multiple embryo transfer',
          'Good success rate expected',
          'Suitable for vitrification'
        ]
      },
      '4BB': {
        grade: '4BB',
        description: 'Good quality blastocyst with balanced morphology between inner cell mass and trophectoderm.',
        blastocystFormation: 'Fully expanded blastocyst (Grade 4)',
        innerCellMass: 'Loosely grouped, several cells (Grade B)',
        trophectoderm: 'Few cells, loosely grouped (Grade B)',
        expansion: 'Fully expanded with thin zona pellucida',
        viability: 'Good implantation potential',
        recommendations: [
          'Good candidate for transfer',
          'Consider multiple embryo transfer',
          'Moderate success rate expected',
          'Suitable for vitrification'
        ]
      },
      '3AA': {
        grade: '3AA',
        description: 'Expanding blastocyst with excellent cell morphology but not fully expanded.',
        blastocystFormation: 'Expanding blastocyst (Grade 3)',
        innerCellMass: 'Very cohesive, many cells, tightly packed (Grade A)',
        trophectoderm: 'Many cells, forming cohesive layer (Grade A)',
        expansion: 'Expanding with visible cavity',
        viability: 'Good implantation potential',
        recommendations: [
          'Good candidate for transfer',
          'May need extended culture',
          'Consider multiple embryo transfer',
          'Can be vitrified but monitor closely'
        ]
      },
      '2AA': {
        grade: '2AA',
        description: 'Early blastocyst with excellent cell morphology but minimal expansion.',
        blastocystFormation: 'Early blastocyst (Grade 2)',
        innerCellMass: 'Very cohesive, many cells, tightly packed (Grade A)',
        trophectoderm: 'Many cells, forming cohesive layer (Grade A)',
        expansion: 'Small cavity visible',
        viability: 'Moderate implantation potential',
        recommendations: [
          'Consider extended culture to Grade 3-4',
          'May not be optimal for immediate transfer',
          'Consider multiple embryo transfer if proceeding',
          'Vitrification possible but lower priority'
        ]
      }
    };

    return gradingData[grade] || {
      grade: grade || 'Unknown',
      description: 'Grading information not available for this embryo.',
      blastocystFormation: 'Not assessed',
      innerCellMass: 'Not assessed',
      trophectoderm: 'Not assessed',
      expansion: 'Not assessed',
      viability: 'Unknown',
      recommendations: ['Consult with embryologist for assessment']
    };
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const profile = await userService.getProfile();
        const first = profile.first_name?.trim?.() || '';
        const last = profile.last_name?.trim?.() || '';
        setUserInitials(`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U');
      } catch {
        // ignore
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load embryo data
  useEffect(() => {
    const fetchEmbryoData = async () => {
      try {
        setLoading(true);
        setError(null);
        // Load mock data for embryo grading
        const mockData: IVFTreatment[] = [
          {
            hisNumber: "HIS001",
            cryolockNum: "CL001",
            canisterNum: 1,
            tankCode: "TANK-A",
            caneCode: "CANE-1",
            gobletColor: "Yellow",
            cryolockColor: "Blue",
            dateOfVitrification: "2024-01-15",
            siteName: "Main Hospital",
            status: "Stored",
            embryoGrading: "4AA",
            description: null
          },
          {
            hisNumber: "HIS002",
            cryolockNum: "CL002",
            canisterNum: 2,
            tankCode: "TANK-B",
            caneCode: "CANE-2",
            gobletColor: "Green",
            cryolockColor: "Red",
            dateOfVitrification: "2024-02-20",
            siteName: "Branch Clinic",
            status: "In Transit",
            embryoGrading: "4AB, 3AA",
            description: "Being transferred to IVF lab"
          },
          {
            hisNumber: "HIS003",
            cryolockNum: "CL003",
            canisterNum: 1,
            tankCode: "TANK-A",
            caneCode: "CANE-3",
            gobletColor: "Blue",
            cryolockColor: "Yellow",
            dateOfVitrification: "2024-03-10",
            siteName: "Main Hospital",
            status: "Stored",
            embryoGrading: "4BA",
            description: null
          },
          {
            hisNumber: "HIS004",
            cryolockNum: "CL004",
            canisterNum: 3,
            tankCode: "TANK-C",
            caneCode: "CANE-1",
            gobletColor: "Red",
            cryolockColor: "Green",
            dateOfVitrification: "2024-01-05",
            siteName: "Satellite Center",
            status: "Thawed",
            embryoGrading: "2AA",
            description: null
          },
          {
            hisNumber: "HIS005",
            cryolockNum: "CL005",
            canisterNum: 2,
            tankCode: "TANK-B",
            caneCode: "CANE-2",
            gobletColor: "Yellow",
            cryolockColor: "Blue",
            dateOfVitrification: "2024-02-28",
            siteName: "Branch Clinic",
            status: "Stored",
            embryoGrading: "4BB, 4AA, 3AA",
            description: null
          },
          {
            hisNumber: "HIS006",
            cryolockNum: "CL006",
            canisterNum: 1,
            tankCode: "TANK-A",
            caneCode: "CANE-4",
            gobletColor: "Purple",
            cryolockColor: "Orange",
            dateOfVitrification: "2024-03-15",
            siteName: "Main Hospital",
            status: "Stored",
            embryoGrading: "4AB",
            description: null
          },
          {
            hisNumber: "HIS007",
            cryolockNum: "CL007",
            canisterNum: 3,
            tankCode: "TANK-C",
            caneCode: "CANE-3",
            gobletColor: "Green",
            cryolockColor: "Blue",
            dateOfVitrification: "2024-01-20",
            siteName: "Satellite Center",
            status: "Stored",
            embryoGrading: "3AA, 4BA",
            description: null
          },
          {
            hisNumber: "HIS008",
            cryolockNum: "CL008",
            canisterNum: 2,
            tankCode: "TANK-B",
            caneCode: "CANE-1",
            gobletColor: "Red",
            cryolockColor: "Yellow",
            dateOfVitrification: "2024-02-10",
            siteName: "Branch Clinic",
            status: "In Transit",
            embryoGrading: "4BB",
            description: "Scheduled for transfer"
          }
        ];
        setEmbryos(mockData);
        // Auto-select first embryo
        if (mockData.length > 0) {
          setSelectedEmbryo(mockData[0]);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load embryo data');
      } finally {
        setLoading(false);
      }
    };
    fetchEmbryoData();
  }, []);

  // Get unique branches and statuses for filters
  const branchOptions = React.useMemo(() => {
    const set = new Set<string>();
    embryos.forEach(embryo => {
      if (embryo.siteName && embryo.siteName.trim()) {
        set.add(embryo.siteName.trim());
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [embryos]);

  const statusOptions = React.useMemo(() => {
    const set = new Set<string>();
    embryos.forEach(embryo => {
      if (embryo.status && embryo.status.trim()) {
        set.add(embryo.status.trim());
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [embryos]);

  // Filter embryos based on selected filters
  const filteredEmbryos = React.useMemo(() => {
    return embryos.filter(embryo => {
      const matchBranch = selectedBranch === 'All' || embryo.siteName === selectedBranch;
      const matchStatus = selectedStatus === 'All' || embryo.status === selectedStatus;
      return matchBranch && matchStatus;
    });
  }, [embryos, selectedBranch, selectedStatus]);

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
        <header className="fixed top-0 left-60 right-0 h-[63px] bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-6 z-40">
          <div />
          <div
            className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#8a2a95] transition-colors duration-200"
            onClick={() => navigate('/user-profile')}
            title="Go to User Profile"
          >
            <span className="text-white text-xs font-semibold">{userInitials}</span>
          </div>
        </header>
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0" style={{ paddingTop: 'calc(63px + 1rem)' }}>
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-black text-2xl">
              Embryo Grading
            </h1>
          </div>

          {/* Main Content Grid - Matching Control Tower Layout */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] lg:grid-rows-[340px_544px] gap-6 min-h-0 items-start">
            {/* Left Panel - Filters and Embryo List */}
            <div className="flex flex-col gap-6 min-w-0">
              {/* Filters Section */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-[380px] flex-shrink-0 flex flex-col justify-center">
                <div className="flex flex-col gap-3">
                  {/* Direction Toggle */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Direction
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDirection('fresh')}
                        className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                          direction === 'fresh'
                            ? 'bg-[#6b1176] text-white border-[#6b1176]'
                            : 'bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50'
                        }`}
                      >
                        Fresh
                      </button>
                      <button
                        type="button"
                        onClick={() => setDirection('frozen')}
                        className={`flex-1 px-3 h-12 border rounded-lg text-sm font-medium transition-colors duration-150 ${
                          direction === 'frozen'
                            ? 'bg-[#6b1176] text-white border-[#6b1176]'
                            : 'bg-white text-gray-700 border-[#E7E1E1] hover:bg-gray-50'
                        }`}
                      >
                        Frozen
                      </button>
                    </div>
                  </div>

                  {/* Branch Filter */}
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
                          {selectedStatus === 'All' ? 'All Statuses' : selectedStatus}
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
                        <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
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
                              {option === 'All' ? 'All Statuses' : option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Embryos List */}
              <div className={`bg-white border border-[#E7E1E1] rounded-lg p-3 w-[380px] flex-shrink-0 flex flex-col overflow-hidden h-[544px]`}>
                <h2 className="font-bold text-black text-base mb-2">
                  Active Embryos
                </h2>
                <div className="grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 rounded-t-lg bg-[#F7ECFF] text-xs font-semibold text-[#6b1176] gap-3">
                  <div className="text-left">Embryo ID</div>
                  <div className="text-center">Grade</div>
                  <div className="text-center">Date</div>
                </div>
                <div
                  className="flex-1 overflow-y-auto overflow-x-hidden mt-1 divide-y divide-gray-100"
                  style={{
                    scrollbarWidth: 'thin'
                  }}
                >
                  {loading ? (
                    <div className="p-4 text-xs text-gray-500">Loading...</div>
                  ) : error ? (
                    <div className="p-4 text-xs text-red-600">{error}</div>
                  ) : filteredEmbryos.length === 0 ? (
                    <div className="p-4 text-xs text-gray-500">No embryos found.</div>
                  ) : (
                    filteredEmbryos.map((embryo, index) => {
                      const embryoId = `${embryo.hisNumber}-${embryo.cryolockNum}`;
                      const isSelected = selectedEmbryo?.hisNumber === embryo.hisNumber && selectedEmbryo?.cryolockNum === embryo.cryolockNum;

                      return (
                        <div
                          key={`${embryo.hisNumber}-${embryo.cryolockNum}-${index}`}
                          className={`grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer ${
                            isSelected ? 'bg-[#F7ECFF] border-l-4 border-[#6b1176]' : ''
                          }`}
                          onClick={() => setSelectedEmbryo(embryo)}
                        >
                          <div className="min-w-0 text-left overflow-hidden">
                            <div className="text-[#6b1176] text-xs font-bold truncate">
                              {embryoId}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {embryo.siteName}
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800">
                              {embryo.embryoGrading || 'N/A'}
                            </span>
                          </div>
                          <div className="text-center text-xs font-bold text-gray-600 truncate">
                            {embryo.dateOfVitrification ? new Date(embryo.dateOfVitrification).toLocaleDateString('en-GB') : 'NA'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Grading Details */}
            <div className="flex flex-col gap-6 min-w-0 w-full row-span-2">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Embryo Grading Details</h2>
                  {selectedEmbryo && (
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedEmbryo.hisNumber} - Cryolock {selectedEmbryo.cryolockNum}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {selectedEmbryo ? (
                    <div className="space-y-6">
                      {/* Basic Information */}
                      <div>
                        <h3 className="text-md font-semibold text-gray-900 mb-3">Basic Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">HIS Number:</span>
                            <p className="text-gray-900">{selectedEmbryo.hisNumber}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Cryolock:</span>
                            <p className="text-gray-900">{selectedEmbryo.cryolockNum}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Site:</span>
                            <p className="text-gray-900">{selectedEmbryo.siteName}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Status:</span>
                            <p className="text-gray-900">{selectedEmbryo.status}</p>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700">Vitrification Date:</span>
                            <p className="text-gray-900">
                              {selectedEmbryo.dateOfVitrification ? new Date(selectedEmbryo.dateOfVitrification).toLocaleDateString('en-GB') : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Grading Information */}
                      {selectedEmbryo.embryoGrading && (
                        <div>
                          <h3 className="text-md font-semibold text-gray-900 mb-3">Grading Analysis</h3>
                          {selectedEmbryo.embryoGrading.split(',').map((grade, index) => {
                            const trimmedGrade = grade.trim();
                            const details = getEmbryoGradingDetails(trimmedGrade);
                            return (
                              <div key={index} className="mb-4 p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg font-bold text-[#6b1176]">{details.grade}</span>
                                  <span className="text-sm text-gray-600">Embryo {index + 1}</span>
                                </div>
                                <p className="text-sm text-gray-700 mb-3">{details.description}</p>

                                <div className="grid grid-cols-1 gap-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">Blastocyst Formation:</span>
                                    <span className="text-gray-900">{details.blastocystFormation}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">Inner Cell Mass:</span>
                                    <span className="text-gray-900">{details.innerCellMass}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">Trophectoderm:</span>
                                    <span className="text-gray-900">{details.trophectoderm}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">Expansion:</span>
                                    <span className="text-gray-900">{details.expansion}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">Viability:</span>
                                    <span className="text-gray-900 font-semibold">{details.viability}</span>
                                  </div>
                                </div>

                                <div className="mt-3">
                                  <span className="font-medium text-gray-700 text-sm">Recommendations:</span>
                                  <ul className="mt-1 text-sm text-gray-700 list-disc list-inside">
                                    {details.recommendations.map((rec, recIndex) => (
                                      <li key={recIndex}>{rec}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Storage Information */}
                      <div>
                        <h3 className="text-md font-semibold text-gray-900 mb-3">Storage Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Tank Code:</span>
                            <p className="text-gray-900">{selectedEmbryo.tankCode}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Canister:</span>
                            <p className="text-gray-900">{selectedEmbryo.canisterNum}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Cane Code:</span>
                            <p className="text-gray-900">{selectedEmbryo.caneCode}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Goblet Color:</span>
                            <p className="text-gray-900">{selectedEmbryo.gobletColor}</p>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700">Cryolock Color:</span>
                            <p className="text-gray-900">{selectedEmbryo.cryolockColor}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <p>Select an embryo from the list to view detailed grading information.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
