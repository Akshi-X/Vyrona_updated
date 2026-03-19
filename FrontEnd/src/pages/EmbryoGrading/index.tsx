import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import Modal from '../../components/Modal';
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

interface EmbryologyLogEntry {
  id: number;
  oocyteNo: string;
  maturity: string;
  oocyteComments: string;
  day0Dish: string;
  pn: string;
  dropNo: string;
  day0ZygoteStatus?: string;
  day0Notes?: string;
  day3CellCount?: string;
  day3Fragmentation?: string;
  day3Symmetry?: string;
  day3Notes?: string;
  day3Label?: string;
  day5Stage?: string;
  day5ExpansionGrade?: string;
  day5IcmGrade?: string;
  day5TeGrade?: string;
  day5Label?: string;
  day6Stage?: string;
  day6ExpansionGrade?: string;
  day6IcmGrade?: string;
  day6TeGrade?: string;
  day6Label?: string;
  day6Progression?: string;
  fate: string;
  fzNo: string;
  notes: string;
}

interface EmbryologyLogFormState {
  oocyteNo: string;
  maturity: string;
  oocyteComments: string;
  day0Dish: string;
  pn: string;
  dropNo: string;
  day0ZygoteStatus: string;
  day0Notes: string;
  day3CellCount: string;
  day3Fragmentation: string;
  day3Symmetry: string;
  day3Notes: string;
  day5Stage: string;
  day5ExpansionGrade: string;
  day5IcmGrade: string;
  day5TeGrade: string;
  day6Stage: string;
  day6ExpansionGrade: string;
  day6IcmGrade: string;
  day6TeGrade: string;
  day6Progression: string;
  fate: string;
  fzNo: string;
  notes: string;
}

interface NewEmbryoFormState {
  hisNumber: string;
  embryo_count: string;
  cryolockNum: string;
  embryoGrading: string;
  siteName: string;
  status: string;
  tankCode: string;
  canisterNum: string;
  caneCode: string;
  gobletColor: string;
  cryolockColor: string;
  description: string;
}

export default function EmbryoGradingPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { his } = useParams<{ his: string }>();
  const detailHis = his?.trim().toUpperCase() || '';
  const isDetailView = Boolean(detailHis);
  const [embryos, setEmbryos] = useState<IVFTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedEmbryo, setSelectedEmbryo] = useState<IVFTreatment | null>(null);
  const [direction, setDirection] = useState<'fresh' | 'frozen'>('fresh');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [embryologyLogsByEmbryo, setEmbryologyLogsByEmbryo] = useState<Record<string, EmbryologyLogEntry[]>>({});
  const [isAddLogFormOpen, setIsAddLogFormOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [openDaySection, setOpenDaySection] = useState<'day0' | 'day3' | 'day5' | 'day6' | null>('day0');
  const [isAddEmbryoFormOpen, setIsAddEmbryoFormOpen] = useState(false);
  const [newEmbryoForm, setNewEmbryoForm] = useState<NewEmbryoFormState>({
    hisNumber: '',
    embryo_count: '',
    cryolockNum: '',
    embryoGrading: '4AA',
    siteName: '',
    status: 'Stored',
    tankCode: '',
    canisterNum: '',
    caneCode: '',
    gobletColor: '',
    cryolockColor: '',
    description: '',
  });
  const [logForm, setLogForm] = useState<EmbryologyLogFormState>({
    oocyteNo: '',
    maturity: 'MII',
    oocyteComments: '',
    day0Dish: '',
    pn: '2PN',
    dropNo: '',
    day0ZygoteStatus: '',
    day0Notes: '',
    day3CellCount: '',
    day3Fragmentation: '',
    day3Symmetry: '',
    day3Notes: '',
    day5Stage: '',
    day5ExpansionGrade: '',
    day5IcmGrade: '',
    day5TeGrade: '',
    day6Stage: '',
    day6ExpansionGrade: '',
    day6IcmGrade: '',
    day6TeGrade: '',
    day6Progression: '',
    fate: 'Freeze',
    fzNo: '',
    notes: '',
  });
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
            embryo_count: 10,
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
            embryo_count: 10,
            tankCode: "TANK-B",
            caneCode: "CANE-2",
            gobletColor: "Green",
            cryolockColor: "Red",
            dateOfVitrification: "2024-02-20",
            siteName: "Branch Clinic",
            status: "In Transit",
            embryoGrading: "4AB",
            description: "Being transferred to IVF lab"
          },
          {
            hisNumber: "HIS003",
            cryolockNum: "CL003",
            canisterNum: 1,
            embryo_count: 10,
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
            embryo_count: 10,
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
            embryo_count: 10,
            tankCode: "TANK-B",
            caneCode: "CANE-2",
            gobletColor: "Yellow",
            cryolockColor: "Blue",
            dateOfVitrification: "2024-02-28",
            siteName: "Branch Clinic",
            status: "Stored",
            embryoGrading: "4BB",
            description: null
          },
          {
            hisNumber: "HIS006",
            cryolockNum: "CL006",
            canisterNum: 1,
            embryo_count: 10,
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
            embryo_count: 10,
            tankCode: "TANK-C",
            caneCode: "CANE-3",
            gobletColor: "Green",
            cryolockColor: "Blue",
            dateOfVitrification: "2024-01-20",
            siteName: "Satellite Center",
            status: "Stored",
            embryoGrading: "3AA",
            description: null
          },
          {
            hisNumber: "HIS008",
            cryolockNum: "CL008",
            canisterNum: 2,
            embryo_count: 10,
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

  const embryoStats = React.useMemo(() => {
    const total = filteredEmbryos.length;
    const stored = filteredEmbryos.filter((embryo) => embryo.status === 'Stored').length;
    const inTransit = filteredEmbryos.filter((embryo) => embryo.status === 'In Transit').length;
    const thawed = filteredEmbryos.filter((embryo) => embryo.status === 'Thawed').length;
    const highGrade = filteredEmbryos.filter((embryo) => {
      const grades = (embryo.embryoGrading || '').split(',').map((g) => g.trim());
      return grades.some((grade) => grade === '4AA' || grade === '4AB' || grade === '4BA');
    }).length;

    return { total, stored, inTransit, thawed, highGrade };
  }, [filteredEmbryos]);

  const getPrimaryGrade = (grading?: string) => {
    return grading?.split(',')[0]?.trim() || 'N/A';
  };

  const getGradeChipStyle = (grade: string) => {
    if (['4AA', '4AB', '4BA'].includes(grade)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (['4BB', '3AA'].includes(grade)) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getEmbryoKey = (embryo: IVFTreatment | null) => {
    if (!embryo) return '';
    return `${embryo.hisNumber}-${embryo.cryolockNum}`;
  };

  const selectedEmbryoKey = getEmbryoKey(selectedEmbryo);
  const selectedEmbryologyLogs = selectedEmbryoKey ? (embryologyLogsByEmbryo[selectedEmbryoKey] || []) : [];

  useEffect(() => {
    if (!detailHis || embryos.length === 0) return;
    const matchedEmbryo = embryos.find((embryo) => embryo.hisNumber.toUpperCase() === detailHis);
    if (matchedEmbryo) {
      setSelectedEmbryo(matchedEmbryo);
    }
  }, [detailHis, embryos]);

  useEffect(() => {
    if (!selectedEmbryo || !selectedEmbryoKey) return;
    setEmbryologyLogsByEmbryo((prev) => {
      if (prev[selectedEmbryoKey]) return prev;
      const embryoCount = Number(selectedEmbryo.embryo_count || 0);

      if (embryoCount > 0) {
        const seedRows: EmbryologyLogEntry[] = Array.from({ length: embryoCount }, (_, index) => ({
          id: index + 1,
          oocyteNo: String(index + 1),
          maturity: 'MII',
          oocyteComments: 'Good cytoplasm',
          day0Dish: String(index + 1),
          pn: '2PN',
          dropNo: String(index + 1),
          day3: '—',
          day4: '—',
          day5: '—',
          day6: '—',
          fate: '—',
          fzNo: '—',
          notes: '—',
        }));

        return { ...prev, [selectedEmbryoKey]: seedRows };
      }

      const grades = (selectedEmbryo.embryoGrading || '')
        .split(',')
        .map((grade) => grade.trim())
        .filter(Boolean);
      const seedRows: EmbryologyLogEntry[] = grades.map((grade, index) => ({
        id: index + 1,
        oocyteNo: String(index + 1),
        maturity: 'MII',
        oocyteComments: index % 2 === 0 ? 'Good cytoplasm' : 'Minor granularity',
        day0Dish: String(Math.floor(index / 3) + 1),
        pn: '2PN',
        dropNo: String((index % 3) + 1),
        day0ZygoteStatus: 'Normal',
        day0Notes: '',
        day3CellCount: String(index % 8 + 2),
        day3Fragmentation: '1',
        day3Symmetry: 'Even',
        day3Notes: '',
        day3Label: `${index % 8 + 2}C1`,
        day5Stage: 'Blastocyst',
        day5ExpansionGrade: grade[0] || '4',
        day5IcmGrade: grade[1] || 'A',
        day5TeGrade: grade[2] || 'A',
        day5Label: grade,
        day6Stage: '',
        day6ExpansionGrade: '',
        day6IcmGrade: '',
        day6TeGrade: '',
        day6Label: '',
        day6Progression: '',
        fate: ['Stored', 'In Transit'].includes(selectedEmbryo.status || '') ? 'Freeze' : 'Discard',
        fzNo: ['Stored', 'In Transit'].includes(selectedEmbryo.status || '') ? `#${index + 1}` : '',
        notes: selectedEmbryo.description || '',
      }));

      return { ...prev, [selectedEmbryoKey]: seedRows };
    });
  }, [selectedEmbryo, selectedEmbryoKey]);

  const resetLogForm = () => {
    setLogForm({
      oocyteNo: '',
      maturity: 'MII',
      oocyteComments: '',
      day0Dish: '',
      pn: '2PN',
      dropNo: '',
      day0ZygoteStatus: '',
      day0Notes: '',
      day3CellCount: '',
      day3Fragmentation: '',
      day3Symmetry: '',
      day3Notes: '',
      day5Stage: '',
      day5ExpansionGrade: '',
      day5IcmGrade: '',
      day5TeGrade: '',
      day6Stage: '',
      day6ExpansionGrade: '',
      day6IcmGrade: '',
      day6TeGrade: '',
      day6Progression: '',
      fate: 'Freeze',
      fzNo: '',
      notes: '',
    });
    setOpenDaySection('day0');
  };

  const handleLogFieldChange = (field: keyof EmbryologyLogFormState, value: string) => {
    setLogForm((prev) => ({ ...prev, [field]: value }));
  };

  // Helper function to generate Day 3 label (e.g., "8C1")
  const generateDay3Label = (cellCount: string, fragmentation: string): string => {
    if (!cellCount || !fragmentation) return '—';
    return `${cellCount}C${fragmentation}`;
  };

  // Helper function to generate blast grade label (e.g., "5AA", "4AB")
  const generateBlastLabel = (expansion: string, icm: string, te: string): string => {
    if (!expansion || !icm || !te) return '—';
    return `${expansion}${icm}${te}`;
  };

  // Helper function to get color for grade (AA=green, BB=yellow, CC=red)
  const getGradeColor = (label: string): string => {
    if (!label || label === '—') return '';
    const icmTe = label.slice(1); // Extract ICM+TE (e.g., "AA", "BB", "AB")
    if (icmTe === 'AA') return 'text-green-600 font-semibold';
    if (icmTe === 'BB') return 'text-yellow-600 font-semibold';
    if (icmTe === 'AB' || icmTe === 'BA') return 'text-amber-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  const handleAddLogEntry = () => {
    if (!selectedEmbryoKey) return;
    
    const day3Label = generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation);
    const day5Label = generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade);
    const day6Label = generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade);

    const updatedEntry: EmbryologyLogEntry = {
      id: editingLogId || Date.now(),
      oocyteNo: logForm.oocyteNo || '—',
      maturity: logForm.maturity || '—',
      oocyteComments: logForm.oocyteComments || '—',
      day0Dish: logForm.day0Dish || '—',
      pn: logForm.pn || '—',
      dropNo: logForm.dropNo || '—',
      day0ZygoteStatus: logForm.day0ZygoteStatus || '—',
      day0Notes: logForm.day0Notes || '—',
      day3CellCount: logForm.day3CellCount || '—',
      day3Fragmentation: logForm.day3Fragmentation || '—',
      day3Symmetry: logForm.day3Symmetry || '—',
      day3Notes: logForm.day3Notes || '—',
      day3Label,
      day5Stage: logForm.day5Stage || '—',
      day5ExpansionGrade: logForm.day5ExpansionGrade || '—',
      day5IcmGrade: logForm.day5IcmGrade || '—',
      day5TeGrade: logForm.day5TeGrade || '—',
      day5Label,
      day6Stage: logForm.day6Stage || '—',
      day6ExpansionGrade: logForm.day6ExpansionGrade || '—',
      day6IcmGrade: logForm.day6IcmGrade || '—',
      day6TeGrade: logForm.day6TeGrade || '—',
      day6Label,
      day6Progression: logForm.day6Progression || '—',
      fate: logForm.fate || '—',
      fzNo: logForm.fzNo || '—',
      notes: logForm.notes || '—',
    };
    
    if (editingLogId) {
      // Update existing entry
      setEmbryologyLogsByEmbryo((prev) => ({
        ...prev,
        [selectedEmbryoKey]: (prev[selectedEmbryoKey] || []).map(log => log.id === editingLogId ? updatedEntry : log),
      }));
      setEditingLogId(null);
    } else {
      // Add new entry
      setEmbryologyLogsByEmbryo((prev) => ({
        ...prev,
        [selectedEmbryoKey]: [...(prev[selectedEmbryoKey] || []), updatedEntry],
      }));
    }
    
    resetLogForm();
    setIsAddLogFormOpen(false);
  };

  const resetNewEmbryoForm = () => {
    setNewEmbryoForm({
      hisNumber: '',
      embryo_count: '',
      cryolockNum: '',
      embryoGrading: '4AA',
      siteName: '',
      status: 'Stored',
      tankCode: '',
      canisterNum: '',
      caneCode: '',
      gobletColor: '',
      cryolockColor: '',
      description: '',
    });
  };

  const handleNewEmbryoFieldChange = (field: keyof NewEmbryoFormState, value: string) => {
    setNewEmbryoForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddEmbryo = () => {
    const hisNumber = newEmbryoForm.hisNumber.trim();
    if (!hisNumber) return;
    const parsedEmbryoCount = Number.parseInt(newEmbryoForm.embryo_count.trim(), 10);
    const embryoCount = Number.isFinite(parsedEmbryoCount) && parsedEmbryoCount > 0 ? parsedEmbryoCount : 1;

    const generatedCryolockNum = `CL${String(embryos.length + 1).padStart(3, '0')}`;

    const newEntry: IVFTreatment = {
      hisNumber,
      cryolockNum: generatedCryolockNum,
      canisterNum: 1,
      embryo_count: embryoCount,
      tankCode: newEmbryoForm.tankCode.trim() || 'TANK-A',
      caneCode: newEmbryoForm.caneCode.trim() || 'CANE-1',
      gobletColor: newEmbryoForm.gobletColor.trim() || 'Yellow',
      cryolockColor: newEmbryoForm.cryolockColor.trim() || 'Blue',
      dateOfVitrification: new Date().toISOString().slice(0, 10),
      siteName: newEmbryoForm.siteName.trim() || 'Main Hospital',
      status: 'Stored',
      embryoGrading: '4AA',
      description: newEmbryoForm.description.trim() || null,
    };

    setEmbryos((prev) => [newEntry, ...prev]);
    setSelectedEmbryo(newEntry);
    setIsAddEmbryoFormOpen(false);
    resetNewEmbryoForm();
  };

  const primaryGradeDetails = selectedEmbryo
    ? getEmbryoGradingDetails(getPrimaryGrade(selectedEmbryo.embryoGrading))
    : null;

  const logSummary = React.useMemo(() => {
    const totalRows = selectedEmbryologyLogs.length;
    const fertilized = selectedEmbryologyLogs.filter((row) => row.pn.toUpperCase() === '2PN').length;
    const blastRows = selectedEmbryologyLogs.filter((row) => (row.day5Label && row.day5Label !== '—') || (row.day6Label && row.day6Label !== '—')).length;
    const frozenRows = selectedEmbryologyLogs.filter((row) => row.fate.toLowerCase() === 'freeze').length;
    return { totalRows, fertilized, blastRows, frozenRows };
  }, [selectedEmbryologyLogs]);

  const calculateDayInCycle = (): string => {
    if (!selectedEmbryo?.dateOfVitrification) {
      return 'Day 0';
    }
    
    try {
      const startDate = new Date(selectedEmbryo.dateOfVitrification);
      const today = new Date();
      const timeDiff = today.getTime() - startDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
      
      if (daysDiff < 0) return 'Day 0';
      if (daysDiff === 0) return 'Day 0';
      return `Day ${daysDiff}`;
    } catch {
      return 'Day 0';
    }
  };

  return (
    <div className="bg-[#FDFAFF] flex w-full h-full">
      <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-10">
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-black text-2xl">
              Embryo Grading
            </h1>
            {isDetailView && (
              <button
                type="button"
                onClick={() => navigate('/embryo-grading')}
                className="px-3 py-2 rounded-md border border-[#E7E1E1] text-sm text-gray-700 hover:bg-gray-50"
              >
                Back to List
              </button>
            )}
          </div>

          {/* Main Content Grid - Matching Control Tower Layout */}
          <div className={`flex-1 grid grid-cols-1 gap-6 min-h-0 ${
            isDetailView
              ? 'lg:grid-cols-1 items-start'
              : 'lg:grid-cols-[380px_320px] items-start'
          }`}>
            {/* Left Panel - Filters and Embryo List */}
            <div className={`flex flex-col gap-6 min-w-0 h-full min-h-0 ${isDetailView ? 'hidden' : ''}`}>
              {/* Filters Section */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-full lg:w-[380px] flex-shrink-0 flex flex-col justify-center shadow-sm">
                <div className="mb-3 pb-2 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-black">Filters</h2>
                  <p className="text-xs text-gray-500">Refine embryos by direction, branch and status</p>
                </div>
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
              <div className={`bg-white border border-[#E7E1E1] rounded-lg p-3 w-full lg:w-[380px] flex-1 flex flex-col overflow-hidden min-h-80 shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-black text-base">
                  Active Embryos
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#6b1176] bg-[#F7ECFF] px-2 py-1 rounded-full">{filteredEmbryos.length}</span>
                    <button
                      type="button"
                      onClick={() => setIsAddEmbryoFormOpen(true)}
                      className="text-xs font-medium px-2.5 py-1 rounded-md bg-[#6b1176] text-white hover:bg-[#5a0f62] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
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
                      const primaryGrade = getPrimaryGrade(embryo.embryoGrading);

                      return (
                        <div
                          key={`${embryo.hisNumber}-${embryo.cryolockNum}-${index}`}
                          className={`grid grid-cols-[minmax(0,130px)_minmax(0,70px)_minmax(0,90px)] pl-2 pr-2 py-2 hover:bg-gray-50 items-center overflow-hidden gap-3 cursor-pointer ${
                            isSelected ? 'bg-[#F7ECFF] border-l-4 border-[#6b1176]' : ''
                          }`}
                          onClick={() => {
                            setSelectedEmbryo(embryo);
                            navigate(`/embryo-grading/${embryo.hisNumber}`);
                          }}
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
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGradeChipStyle(primaryGrade)}`}>
                              {primaryGrade}
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

            {/* Right Panel - Embryology Log Sheet */}
            {isDetailView && (
            <div className="flex flex-col gap-6 min-w-0 w-full h-full min-h-0">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Embryology Log Sheet</h2>
                    {selectedEmbryo && (
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedEmbryo.hisNumber} - Cryolock {selectedEmbryo.cryolockNum}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {selectedEmbryo ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-[#E7E1E1] p-3 bg-[#FCF9FF]">
                          <p className="text-xs text-gray-500">Total Oocytes Logged</p>
                          <p className="text-lg font-semibold text-black mt-1">{logSummary.totalRows}</p>
                        </div>
                        <div className="rounded-lg border border-[#E7E1E1] p-3 bg-[#FCF9FF]">
                          <p className="text-xs text-gray-500">Fertilized (2PN)</p>
                          <p className="text-lg font-semibold text-black mt-1">{logSummary.fertilized}</p>
                        </div>
                        <div className="rounded-lg border border-[#E7E1E1] p-3 bg-[#FCF9FF]">
                          <p className="text-xs text-gray-500">Blast Logged</p>
                          <p className="text-lg font-semibold text-black mt-1">{logSummary.blastRows}</p>
                        </div>
                        <div className="rounded-lg border border-[#E7E1E1] p-3 bg-[#FCF9FF]">
                          <p className="text-xs text-gray-500">Frozen (Fz)</p>
                          <p className="text-lg font-semibold text-[#6b1176] mt-1">{logSummary.frozenRows}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#E7E1E1] bg-white p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Patient</p>
                            <p className="font-medium text-gray-900">{selectedEmbryo.hisNumber}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Site</p>
                            <p className="font-medium text-gray-900">{selectedEmbryo.siteName || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Primary Grade</p>
                            <p className="font-medium text-gray-900">{primaryGradeDetails?.grade || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Current Day</p>
                            <p className="font-medium text-gray-900">{calculateDayInCycle()}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#E7E1E1] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-[1320px] w-full text-xs">
                            <thead className="bg-[#F7ECFF] text-[#6b1176]">
                              <tr>
                                <th className="px-2 py-2 text-left font-semibold">S.No</th>
                                <th className="px-2 py-2 text-left font-semibold">Oocyte No</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 0 Dish</th>
                                <th className="px-2 py-2 text-left font-semibold">PN</th>
                                <th className="px-2 py-2 text-left font-semibold">Drop No</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 3</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 4</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 5</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 6</th>
                                <th className="px-2 py-2 text-left font-semibold">Fate</th>
                                <th className="px-2 py-2 text-left font-semibold">FZ No</th>
                                <th className="px-2 py-2 text-left font-semibold">Notes</th>
                                <th className="px-2 py-2 text-left font-semibold w-24 sticky right-0 z-10 bg-[#F7ECFF] border-l border-[#E7E1E1]">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedEmbryologyLogs.length === 0 ? (
                                <tr>
                                  <td colSpan={13} className="px-3 py-6 text-center text-gray-500">No log entries yet. Click Add Entry.</td>
                                </tr>
                              ) : (
                                selectedEmbryologyLogs.map((row, index) => (
                                  <tr key={row.id} className="border-t border-[#F1F1F1] hover:bg-[#FCF9FF]">
                                    <td className="px-2 py-2">{index + 1}</td>
                                    <td className="px-2 py-2">{row.oocyteNo}</td>
                                    <td className="px-2 py-2">{row.day0Dish}</td>
                                    <td className="px-2 py-2">{row.pn}</td>
                                    <td className="px-2 py-2">{row.dropNo}</td>
                                    <td className="px-2 py-2 font-semibold text-center">{row.day3Label || '—'}</td>
                                    <td className="px-2 py-2 text-xs text-center">{row.day3CellCount && row.day3Fragmentation ? `${row.day3CellCount}C${row.day3Fragmentation}` : '—'}</td>
                                    <td className={`px-2 py-2 font-semibold text-center ${getGradeColor(row.day5Label || '—')}`}>{row.day5Label || '—'}</td>
                                    <td className={`px-2 py-2 font-semibold text-center ${getGradeColor(row.day6Label || '—')}`}>{row.day6Label || '—'}</td>
                                    <td className="px-2 py-2">{row.fate}</td>
                                    <td className="px-2 py-2">{row.fzNo}</td>
                                    <td className="px-2 py-2 text-xs">{row.notes}</td>
                                    <td className="px-2 py-2 flex gap-1 sticky right-0 z-10 bg-white border-l border-[#E7E1E1]">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLogForm({
                                            oocyteNo: row.oocyteNo === '—' ? '' : (row.oocyteNo || ''),
                                            maturity: row.maturity === '—' ? '' : (row.maturity || 'MII'),
                                            oocyteComments: row.oocyteComments === '—' ? '' : (row.oocyteComments || ''),
                                            day0Dish: row.day0Dish === '—' ? '' : (row.day0Dish || ''),
                                            pn: row.pn === '—' ? '' : (row.pn || '2PN'),
                                            dropNo: row.dropNo === '—' ? '' : (row.dropNo || ''),
                                            day0ZygoteStatus: row.day0ZygoteStatus === '—' ? '' : (row.day0ZygoteStatus || ''),
                                            day0Notes: row.day0Notes === '—' ? '' : (row.day0Notes || ''),
                                            day3CellCount: row.day3CellCount === '—' ? '' : (row.day3CellCount || ''),
                                            day3Fragmentation: row.day3Fragmentation === '—' ? '' : (row.day3Fragmentation || ''),
                                            day3Symmetry: row.day3Symmetry === '—' ? '' : (row.day3Symmetry || ''),
                                            day3Notes: row.day3Notes === '—' ? '' : (row.day3Notes || ''),
                                            day5Stage: row.day5Stage === '—' ? '' : (row.day5Stage || ''),
                                            day5ExpansionGrade: row.day5ExpansionGrade === '—' ? '' : (row.day5ExpansionGrade || ''),
                                            day5IcmGrade: row.day5IcmGrade === '—' ? '' : (row.day5IcmGrade || ''),
                                            day5TeGrade: row.day5TeGrade === '—' ? '' : (row.day5TeGrade || ''),
                                            day6Stage: row.day6Stage === '—' ? '' : (row.day6Stage || ''),
                                            day6ExpansionGrade: row.day6ExpansionGrade === '—' ? '' : (row.day6ExpansionGrade || ''),
                                            day6IcmGrade: row.day6IcmGrade === '—' ? '' : (row.day6IcmGrade || ''),
                                            day6TeGrade: row.day6TeGrade === '—' ? '' : (row.day6TeGrade || ''),
                                            day6Progression: row.day6Progression === '—' ? '' : (row.day6Progression || ''),
                                            fate: row.fate === '—' ? 'Freeze' : (row.fate || 'Freeze'),
                                            fzNo: row.fzNo === '—' ? '' : (row.fzNo || ''),
                                            notes: row.notes === '—' ? '' : (row.notes || ''),
                                          });
                                          setEditingLogId(row.id);
                                          setIsAddLogFormOpen(true);
                                        }}
                                        className="px-2 py-1 text-xs bg-[#6b1176] text-white rounded hover:bg-[#5a0f62] transition-colors"
                                        title="Update entry"
                                      >
                                        Update
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {selectedEmbryo && (
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={() => setIsAddLogFormOpen(true)}
                            className="px-2.5 py-1.5 rounded bg-[#6b1176] text-white text-xs font-medium hover:bg-[#5a0f62] transition-colors"
                          >
                            Add Oocyte
                          </button>
                        </div>
                      )}

                      <div className="rounded-lg border border-[#E7E1E1] p-4 bg-white">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Grade Context</h3>
                        <p className="text-sm text-gray-700">{primaryGradeDetails?.description || 'No grade context available.'}</p>
                        <p className="text-xs text-gray-500 mt-2">{primaryGradeDetails?.viability || '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <p>Select an embryo from the left list to view and maintain its embryology log sheet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {!isDetailView && (
            <div className="lg:sticky lg:top-4 self-start w-full lg:w-[340px]">
              <div className="rounded-lg border border-[#E7E1E1] bg-white shadow-sm p-5 space-y-4">
                <div className="border-b border-[#F0EAF4] pb-4">
                  <p className="text-xs uppercase tracking-widest font-semibold text-[#8A7892]">Status Overview</p>
                  <p className="text-sm font-bold text-[#6b1176] mt-2">Embryo Snapshot</p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-[#E8E1F0] bg-gradient-to-br from-[#FCF9FF] to-[#F8F4FD] px-4 py-4 min-h-[90px] flex flex-col justify-center">
                    <p className="text-xs font-medium text-gray-600">Total Embryos</p>
                    <p className="text-[32px] leading-none font-bold text-black mt-2">{embryoStats.total}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#E6F4EC] bg-gradient-to-br from-[#F5FCF8] to-[#EEFAF6] px-3 py-3 min-h-[75px] flex flex-col justify-center hover:shadow-sm transition-shadow">
                      <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">Stored</p>
                      <p className="text-xl font-bold text-emerald-700 mt-1">{embryoStats.stored}</p>
                    </div>
                    <div className="rounded-lg border border-[#FFF3CD] bg-gradient-to-br from-[#FFF8E9] to-[#FFF5DB] px-3 py-3 min-h-[75px] flex flex-col justify-center hover:shadow-sm transition-shadow">
                      <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">In Transit</p>
                      <p className="text-xl font-bold text-amber-700 mt-1">{embryoStats.inTransit}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#DDEFFA] bg-gradient-to-br from-[#F4FAFF] to-[#EBF7FF] px-3 py-3 min-h-[75px] flex flex-col justify-center hover:shadow-sm transition-shadow">
                      <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">Thawed</p>
                      <p className="text-xl font-bold text-sky-700 mt-1">{embryoStats.thawed}</p>
                    </div>
                    <div className="rounded-lg border border-[#F5EFF9] bg-gradient-to-br from-[#FCF7FF] to-[#F9F1FE] px-3 py-3 min-h-[75px] flex flex-col justify-center hover:shadow-sm transition-shadow">
                      <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">High Grade</p>
                      <p className="text-xl font-bold text-[#6b1176] mt-1">{embryoStats.highGrade}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </main>

      <Modal
        isOpen={isAddEmbryoFormOpen}
        onClose={() => {
          setIsAddEmbryoFormOpen(false);
          resetNewEmbryoForm();
        }}
        title="Add New HIS"
        description="Fill basic embryo details to create a new HIS entry"
        containerClassName="w-full max-w-[750px]"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="HIS Number *" value={newEmbryoForm.hisNumber} onChange={(e) => handleNewEmbryoFieldChange('hisNumber', e.target.value)} />
            <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" type="number" min={1} placeholder="Embryo Count" value={newEmbryoForm.embryo_count} onChange={(e) => handleNewEmbryoFieldChange('embryo_count', e.target.value)} />
            <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Site / Branch" value={newEmbryoForm.siteName} onChange={(e) => handleNewEmbryoFieldChange('siteName', e.target.value)} />
            <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Incubator ID" value={newEmbryoForm.tankCode} onChange={(e) => handleNewEmbryoFieldChange('tankCode', e.target.value)} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAddEmbryoFormOpen(false);
                resetNewEmbryoForm();
              }}
              className="px-3 py-2 rounded-md border border-[#E7E1E1] text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddEmbryo}
              disabled={!newEmbryoForm.hisNumber.trim()}
              className="px-3 py-2 rounded-md bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0f62] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add New HIS
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAddLogFormOpen}
        onClose={() => {
          setIsAddLogFormOpen(false);
          resetLogForm();
          setEditingLogId(null);
        }}
        title={editingLogId ? "Edit Log Entry" : "Add Log Entry"}
        description={editingLogId ? "Update embryology sheet details for the selected entry" : "Enter embryology sheet details for the selected HIS"}
        containerClassName="w-full max-w-[1050px]"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="rounded-xl border border-[#E7E1E1] bg-gradient-to-r from-[#FCF9FF] to-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#6b1176] uppercase tracking-wide">Embryology Sheet</span>
              <span className="h-1 w-1 rounded-full bg-[#9c3aa6]" />
              <span className="text-xs text-gray-600">HIS: {selectedEmbryo?.hisNumber || '—'}</span>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-[#e6d3ec] bg-[#f8f0fb] px-2.5 py-1 text-xs font-medium text-[#6b1176]">
              {editingLogId ? 'Update Mode' : 'New Entry'}
            </span>
          </div>
          
          {/* Oocyte Identity (always visible) */}
          <div className="rounded-xl border border-[#E7E1E1] bg-white px-4 py-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Oocyte Identity</h3>
            <div className="grid grid-cols-1 gap-2 w-full sm:max-w-[220px]">
              <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Oocyte No" value={logForm.oocyteNo} onChange={(e) => handleLogFieldChange('oocyteNo', e.target.value)} />
            </div>
          </div>

          {/* Day 0: Fertilization Check (PN Stage) */}
          <div className="rounded-xl border border-[#E7E1E1] bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setOpenDaySection((prev) => (prev === 'day0' ? null : 'day0'))}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-gray-900">📅 Day 0: Fertilization Check (PN Stage)</h3>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e6d3ec] bg-[#f8f0fb] text-sm font-semibold text-[#6b1176]">{openDaySection === 'day0' ? '−' : '+'}</span>
            </button>
            {openDaySection === 'day0' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                  <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Day 0 Dish" value={logForm.day0Dish} onChange={(e) => handleLogFieldChange('day0Dish', e.target.value)} />
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.pn} onChange={(e) => handleLogFieldChange('pn', e.target.value)}>
                    <option value="2PN">✅ 2PN (normal)</option>
                    <option value="1PN">1PN</option>
                    <option value="3PN">3PN</option>
                    <option value="0PN">0PN</option>
                    <option value="Degenerated">Degenerated</option>
                  </select>
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day0ZygoteStatus} onChange={(e) => handleLogFieldChange('day0ZygoteStatus', e.target.value)}>
                    <option value="">Zygote Status</option>
                    <option value="Normal">Normal</option>
                    <option value="Abnormal">Abnormal</option>
                  </select>
                  <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Drop No" value={logForm.dropNo} onChange={(e) => handleLogFieldChange('dropNo', e.target.value)} />
                </div>
                <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm mt-2 w-full" placeholder="Day 0 Notes (e.g., early cleavage)" value={logForm.day0Notes} onChange={(e) => handleLogFieldChange('day0Notes', e.target.value)} />
              </>
            )}
          </div>

          {/* Day 3 Entry */}
          <div className="rounded-xl border border-[#E7E1E1] bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setOpenDaySection((prev) => (prev === 'day3' ? null : 'day3'))}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-gray-900">📅 Day 3: Cleavage Stage</h3>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e6d3ec] bg-[#f8f0fb] text-sm font-semibold text-[#6b1176]">{openDaySection === 'day3' ? '−' : '+'}</span>
            </button>
            {openDaySection === 'day3' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day3CellCount} onChange={(e) => handleLogFieldChange('day3CellCount', e.target.value)}>
                    <option value="">Cell Count</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9+">9+</option>
                  </select>
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day3Fragmentation} onChange={(e) => handleLogFieldChange('day3Fragmentation', e.target.value)}>
                    <option value="">Fragmentation</option>
                    <option value="1">1 (≤10%)</option>
                    <option value="2">2 (10–25%)</option>
                    <option value="3">3 (25–50%)</option>
                    <option value="4">4 (&gt;50%)</option>
                  </select>
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day3Symmetry} onChange={(e) => handleLogFieldChange('day3Symmetry', e.target.value)}>
                    <option value="">Symmetry</option>
                    <option value="Even">Even</option>
                    <option value="Slightly uneven">Slightly uneven</option>
                    <option value="Uneven">Uneven</option>
                  </select>
                  {logForm.day3CellCount && logForm.day3Fragmentation ? (
                    <div className="h-10 rounded-md border border-[#9c3aa6] bg-[#f3e8f7] px-3 flex items-center">
                      <span className="text-sm font-semibold text-[#6b1176]">🔀 {generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation)}</span>
                    </div>
                  ) : (
                    <div className="h-10 rounded-md border border-[#E7E1E1] bg-gray-50 px-3 flex items-center">
                      <span className="text-sm text-gray-400">Label</span>
                    </div>
                  )}
                </div>
                <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm mt-2 w-full" placeholder="Day 3 Notes (e.g., multinucleation)" value={logForm.day3Notes} onChange={(e) => handleLogFieldChange('day3Notes', e.target.value)} />
              </>
            )}
          </div>

          {/* Day 5 Blastocyst Assessment */}
          <div className="rounded-xl border border-[#E7E1E1] bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setOpenDaySection((prev) => (prev === 'day5' ? null : 'day5'))}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-sm font-semibold text-gray-900">📅 Day 5: Blastocyst Assessment</h3>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e6d3ec] bg-[#f8f0fb] text-sm font-semibold text-[#6b1176]">{openDaySection === 'day5' ? '−' : '+'}</span>
            </button>
            {openDaySection === 'day5' && (
              <>
                <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white w-full mb-2 mt-3" value={logForm.day5Stage} onChange={(e) => handleLogFieldChange('day5Stage', e.target.value)}>
                  <option value="">Development Stage</option>
                  <option value="Cleavage">Cleavage (cells)</option>
                  <option value="Morula">Morula</option>
                  <option value="Early Blast">Early Blast (EB)</option>
                  <option value="Blastocyst">Blastocyst</option>
                </select>

                {logForm.day5Stage === 'Blastocyst' && (
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Expansion (1–6)</label>
                      <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day5ExpansionGrade} onChange={(e) => handleLogFieldChange('day5ExpansionGrade', e.target.value)}>
                        <option value="">—</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">ICM</label>
                      <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day5IcmGrade} onChange={(e) => handleLogFieldChange('day5IcmGrade', e.target.value)}>
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">TE</label>
                      <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day5TeGrade} onChange={(e) => handleLogFieldChange('day5TeGrade', e.target.value)}>
                        <option value="">—</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    </div>
                    {logForm.day5ExpansionGrade && logForm.day5IcmGrade && logForm.day5TeGrade ? (
                      <div className="h-10 rounded-md border border-[#9c3aa6] bg-[#f3e8f7] px-3 flex items-center">
                        <span className={`text-sm font-semibold ${getGradeColor(generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade))}`}>
                          ✓ {generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade)}
                        </span>
                      </div>
                    ) : (
                      <div className="h-10 rounded-md border border-[#E7E1E1] bg-gray-50 px-3 flex items-center">
                        <span className="text-sm text-gray-400">Label</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Day 6 Blastocyst Assessment (optional if Day 5 not blastocyst) */}
          {logForm.day5Stage && logForm.day5Stage !== 'Blastocyst' && (
            <div className="rounded-xl border border-[#E7E1E1] bg-white px-4 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => setOpenDaySection((prev) => (prev === 'day6' ? null : 'day6'))}
                className="w-full flex items-center justify-between text-left"
              >
                <h3 className="text-sm font-semibold text-gray-900">📅 Day 6: Late Blastocyst Check</h3>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e6d3ec] bg-[#f8f0fb] text-sm font-semibold text-[#6b1176]">{openDaySection === 'day6' ? '−' : '+'}</span>
              </button>
              {openDaySection === 'day6' && (
                <>
                  <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white w-full mb-2 mt-3" value={logForm.day6Stage} onChange={(e) => handleLogFieldChange('day6Stage', e.target.value)}>
                    <option value="">Development Stage</option>
                    <option value="Cleavage">Cleavage (cells)</option>
                    <option value="Morula">Morula</option>
                    <option value="Early Blast">Early Blast (EB)</option>
                    <option value="Blastocyst">Blastocyst</option>
                  </select>

                  {logForm.day6Stage === 'Blastocyst' && (
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Expansion (1–6)</label>
                        <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day6ExpansionGrade} onChange={(e) => handleLogFieldChange('day6ExpansionGrade', e.target.value)}>
                          <option value="">—</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="6">6</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">ICM</label>
                        <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day6IcmGrade} onChange={(e) => handleLogFieldChange('day6IcmGrade', e.target.value)}>
                          <option value="">—</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">TE</label>
                        <select className="h-10 w-full rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.day6TeGrade} onChange={(e) => handleLogFieldChange('day6TeGrade', e.target.value)}>
                          <option value="">—</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                      {logForm.day6ExpansionGrade && logForm.day6IcmGrade && logForm.day6TeGrade ? (
                        <div className="h-10 rounded-md border border-[#9c3aa6] bg-[#f3e8f7] px-3 flex items-center">
                          <span className={`text-sm font-semibold ${getGradeColor(generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade))}`}>
                            ⚡ {generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade)}
                          </span>
                        </div>
                      ) : (
                        <div className="h-10 rounded-md border border-[#E7E1E1] bg-gray-50 px-3 flex items-center">
                          <span className="text-sm text-gray-400">Label</span>
                        </div>
                      )}
                    </div>
                  )}

                  {logForm.day6Stage && (
                    <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white w-full" value={logForm.day6Progression} onChange={(e) => handleLogFieldChange('day6Progression', e.target.value)}>
                      <option value="">Progression Status</option>
                      <option value="Delayed development">Delayed development</option>
                      <option value="Same as Day 5">Same as Day 5</option>
                      <option value="Improved">Improved</option>
                      <option value="Degenerated">Degenerated</option>
                    </select>
                  )}
                </>
              )}
            </div>
          )}

          {/* Fate & Freeze Details (Final Decision) */}
          <div className="rounded-xl border border-[#E7E1E1] bg-gradient-to-r from-[#FCF9FF] to-white px-4 py-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">🎯 Final Decision</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white" value={logForm.fate} onChange={(e) => handleLogFieldChange('fate', e.target.value)}>
                <option value="Freeze">❄️ Freeze</option>
                <option value="Transfer">🧬 Transfer</option>
                <option value="Discard">❌ Discard</option>
              </select>
              
              {logForm.fate === 'Freeze' && (
                <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Freeze ID (e.g., #1, #2)" value={logForm.fzNo} onChange={(e) => handleLogFieldChange('fzNo', e.target.value)} />
              )}

              {logForm.fate !== 'Discard' && (
                <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Additional notes" value={logForm.notes} onChange={(e) => handleLogFieldChange('notes', e.target.value)} />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 pt-3 pb-2 border-t border-[#E7E1E1] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <button
              type="button"
              onClick={() => {
                setIsAddLogFormOpen(false);
                resetLogForm();
                setEditingLogId(null);
              }}
              className="px-4 py-2 rounded-md border border-[#E7E1E1] text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddLogEntry}
              className="px-4 py-2 rounded-md bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0f62] shadow-sm"
            >
              {editingLogId ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
