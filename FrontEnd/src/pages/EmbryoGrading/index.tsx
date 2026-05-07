import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';
import EmbryosIcon from '../../assets/DashBoardIcons/Embryos.svg';
import Modal from '../../components/Modal';
import FilterPanel, { FilterSelect, FilterToggle } from '../../components/FilterPanel';
import { type IVFTreatment } from '../../types/ivf';
import { ivfService, type IvfBranch } from '../../services/ivfService';
import { shipmentService } from '../../services/shipmentService';

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
  patientName: string;
  oocytes: string;
  m2: string;
  m1: string;
  gv: string;
  others: string;
  injected: string;
  cryolockNum: string;
  embryoGrading: string;
  siteName: string;
  branch_id: number | null;
  status: string;
  tankCode: string;
  canisterNum: string;
  caneCode: string;
  gobletColor: string;
  cryolockColor: string;
  description: string;
  injectionMethod: string;
  spermQuality: string;
  oocytesQuality: string;
  cycleType: string;
  incubator_id: number | null;
  chamberPosition: string;
}

interface IncubatorItem {
  incubator_id: number;
  incubator_code: string | null;
  external_id: string | null;
  chamber_r: number | null;
  chamber_c: number | null;
}

export default function EmbryoGradingPage() {
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
  const [embryologyLogsByEmbryo, setEmbryologyLogsByEmbryo] = useState<Record<string, EmbryologyLogEntry[]>>({});
  const [isAddLogFormOpen, setIsAddLogFormOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [openDaySection, setOpenDaySection] = useState<'day0' | 'day3' | 'day5' | 'day6' | null>('day0');
  const [isAddEmbryoFormOpen, setIsAddEmbryoFormOpen] = useState(false);
  const [branches, setBranches] = useState<IvfBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [incubators, setIncubators] = useState<IncubatorItem[]>([]);
  const [incubatorsLoading, setIncubatorsLoading] = useState(false);
  const [selectedIncubator, setSelectedIncubator] = useState<IncubatorItem | null>(null);
  const [logModalStep, setLogModalStep] = useState(0);
  const [newEmbryoForm, setNewEmbryoForm] = useState<NewEmbryoFormState>({
    hisNumber: '',
    patientName: '',
    oocytes: '',
    m2: '',
    m1: '',
    gv: '',
    others: '',
    injected: '',
    cryolockNum: '',
    embryoGrading: '4AA',
    siteName: '',
    branch_id: null,
    status: 'Stored',
    tankCode: '',
    canisterNum: '',
    caneCode: '',
    gobletColor: '',
    cryolockColor: '',
    description: '',
    injectionMethod: '',
    spermQuality: '',
    oocytesQuality: '',
    cycleType: '',
    incubator_id: null,
    chamberPosition: '',
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
    fate: '',
    fzNo: '',
    notes: '',
  });

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


  // Load embryo data
  useEffect(() => {
    const fetchEmbryoData = async () => {
      try {
        setLoading(true);
        setError(null);
        // Load mock data for embryo grading
        const mockData: IVFTreatment[] = [
          {
            hisNumber: "HIS001", patientName: "Ananya Krishnan",
            cryolockNum: "CL001", canisterNum: 1, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-A", caneCode: "CANE-1", gobletColor: "Yellow", cryolockColor: "Blue",
            dateOfVitrification: "2024-01-15", siteName: "Main Hospital", status: "Stored", embryoGrading: "4AA", description: null,
            injectionMethod: "ICSI", spermQuality: "Good", oocytesQuality: "Good", cycleType: "OG", incubatorCode: "INC-A1", chamberPosition: "3",
          },
          {
            hisNumber: "HIS002", patientName: "Priya Subramaniam",
            cryolockNum: "CL002", canisterNum: 2, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-B", caneCode: "CANE-2", gobletColor: "Green", cryolockColor: "Red",
            dateOfVitrification: "2024-02-20", siteName: "Branch Clinic", status: "In Transit", embryoGrading: "4AB", description: "Being transferred to IVF lab",
            injectionMethod: "PICSI", spermQuality: "Average", oocytesQuality: "Good", cycleType: "DOHSP", incubatorCode: "INC-B2", chamberPosition: "7",
          },
          {
            hisNumber: "HIS003", patientName: "Meena Rajan",
            cryolockNum: "CL003", canisterNum: 1, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-A", caneCode: "CANE-3", gobletColor: "Blue", cryolockColor: "Yellow",
            dateOfVitrification: "2024-03-10", siteName: "Main Hospital", status: "Stored", embryoGrading: "4BA", description: null,
            injectionMethod: "ICSI", spermQuality: "Good", oocytesQuality: "Average", cycleType: "OG", incubatorCode: "INC-A1", chamberPosition: "12",
          },
          {
            hisNumber: "HIS004", patientName: "Divya Nair",
            cryolockNum: "CL004", canisterNum: 3, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-C", caneCode: "CANE-1", gobletColor: "Red", cryolockColor: "Green",
            dateOfVitrification: "2024-01-05", siteName: "Satellite Center", status: "Thawed", embryoGrading: "2AA", description: null,
            injectionMethod: "IMSI", spermQuality: "Poor", oocytesQuality: "Average to Poor", cycleType: "DET", incubatorCode: "INC-C1", chamberPosition: "2",
          },
          {
            hisNumber: "HIS005", patientName: "Lakshmi Venkat",
            cryolockNum: "CL005", canisterNum: 2, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-B", caneCode: "CANE-2", gobletColor: "Yellow", cryolockColor: "Blue",
            dateOfVitrification: "2024-02-28", siteName: "Branch Clinic", status: "Stored", embryoGrading: "4BB", description: null,
            injectionMethod: "ICSI", spermQuality: "Average (NI)", oocytesQuality: "Good", cycleType: "OG", incubatorCode: "INC-B2", chamberPosition: "5",
          },
          {
            hisNumber: "HIS006", patientName: "Kavitha Murali",
            cryolockNum: "CL006", canisterNum: 1, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-A", caneCode: "CANE-4", gobletColor: "Purple", cryolockColor: "Orange",
            dateOfVitrification: "2024-03-15", siteName: "Main Hospital", status: "Stored", embryoGrading: "4AB", description: null,
            injectionMethod: "PICSI", spermQuality: "Good", oocytesQuality: "Good", cycleType: "DOHSP", incubatorCode: "INC-A2", chamberPosition: "9",
          },
          {
            hisNumber: "HIS007", patientName: "Saranya Pillai",
            cryolockNum: "CL007", canisterNum: 3, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-C", caneCode: "CANE-3", gobletColor: "Green", cryolockColor: "Blue",
            dateOfVitrification: "2024-01-20", siteName: "Satellite Center", status: "Stored", embryoGrading: "3AA", description: null,
            injectionMethod: "ICSI", spermQuality: "Average", oocytesQuality: "Average", cycleType: "OG", incubatorCode: "INC-C1", chamberPosition: "6",
          },
          {
            hisNumber: "HIS008", patientName: "Rekha Chandran",
            cryolockNum: "CL008", canisterNum: 2, embryo_count: 10,
            oocyte_m2: 8, oocyte_m1: 1, oocyte_gv: 0, oocyte_others: 1,
            tankCode: "TANK-B", caneCode: "CANE-1", gobletColor: "Red", cryolockColor: "Yellow",
            dateOfVitrification: "2024-02-10", siteName: "Branch Clinic", status: "In Transit", embryoGrading: "4BB", description: "Scheduled for transfer",
            injectionMethod: "IMSI", spermQuality: "Average (NI)", oocytesQuality: "Average to Poor", cycleType: "OG", incubatorCode: "INC-B1", chamberPosition: "4",
          },
        ];
        setEmbryos(mockData);
      } catch (err: any) {
        setError(err?.message || 'Failed to load embryo data');
      } finally {
        setLoading(false);
      }
    };
    fetchEmbryoData();
  }, []);

  // Fetch branches when Add Cycle modal opens
  useEffect(() => {
    if (!isAddEmbryoFormOpen) return;
    setBranchesLoading(true);
    ivfService.getBranches().then((res) => {
      setBranches(Array.isArray(res?.branches) ? res.branches : []);
    }).catch(() => {
      setBranches([]);
    }).finally(() => setBranchesLoading(false));
  }, [isAddEmbryoFormOpen]);

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

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (selectedBranch !== 'All') count++;
    if (selectedStatus !== 'All') count++;
    return count;
  }, [selectedBranch, selectedStatus]);

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
        const m2Count = selectedEmbryo.oocyte_m2 ?? 0;
        const m1Count = selectedEmbryo.oocyte_m1 ?? 0;
        const getMaturity = (i: number): string => {
          if (i < m2Count) return 'MII';
          if (i < m2Count + m1Count) return 'MI';
          return '—';
        };
        const seedRows: EmbryologyLogEntry[] = Array.from({ length: embryoCount }, (_, index) => ({
          id: index + 1,
          oocyteNo: String(index + 1),
          maturity: getMaturity(index),
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
      fate: '',
      fzNo: '',
      notes: '',
    });
    setOpenDaySection('day0');
    setLogModalStep(0);
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
      patientName: '',
      oocytes: '',
      m2: '',
      m1: '',
      gv: '',
      others: '',
      injected: '',
      cryolockNum: '',
      embryoGrading: '4AA',
      siteName: '',
      branch_id: null,
      status: 'Stored',
      tankCode: '',
      canisterNum: '',
      caneCode: '',
      gobletColor: '',
      cryolockColor: '',
      description: '',
      injectionMethod: '',
      spermQuality: '',
      oocytesQuality: '',
      cycleType: '',
      incubator_id: null,
      chamberPosition: '',
    });
    setSelectedIncubator(null);
    setIncubators([]);
  };

  const handleNewEmbryoFieldChange = (field: keyof NewEmbryoFormState, value: string) => {
    setNewEmbryoForm((prev) => {
      const next = { ...prev, [field]: value };
      const toNum = (v: string) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
      if (field === 'm2' || field === 'm1' || field === 'others' || field === 'gv') {
        const injected = toNum(next.m2) + toNum(next.m1) + toNum(next.others);
        next.injected = injected > 0 ? String(injected) : '';
        const oocytes = toNum(next.m2) + toNum(next.m1) + toNum(next.gv) + toNum(next.others);
        next.oocytes = oocytes > 0 ? String(oocytes) : '';
      }
      return next;
    });
  };

  const handleAddEmbryo = () => {
    const hisNumber = newEmbryoForm.hisNumber.trim();
    if (!hisNumber) return;
    const parsedInjected = Number.parseInt(newEmbryoForm.injected.trim(), 10);
    const embryoCount = Number.isFinite(parsedInjected) && parsedInjected > 0 ? parsedInjected : 1;

    const generatedCryolockNum = `CL${String(embryos.length + 1).padStart(3, '0')}`;

    const parseCount = (v: string) => { const n = Number.parseInt(v.trim(), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

    const newEntry: IVFTreatment = {
      hisNumber,
      patientName: newEmbryoForm.patientName.trim() || undefined,
      cryolockNum: generatedCryolockNum,
      canisterNum: 1,
      embryo_count: embryoCount,
      oocyte_m2: parseCount(newEmbryoForm.m2),
      oocyte_m1: parseCount(newEmbryoForm.m1),
      oocyte_gv: parseCount(newEmbryoForm.gv),
      oocyte_others: parseCount(newEmbryoForm.others),
      tankCode: newEmbryoForm.tankCode.trim() || 'TANK-A',
      caneCode: newEmbryoForm.caneCode.trim() || 'CANE-1',
      gobletColor: newEmbryoForm.gobletColor.trim() || 'Yellow',
      cryolockColor: newEmbryoForm.cryolockColor.trim() || 'Blue',
      dateOfVitrification: new Date().toISOString().slice(0, 10),
      siteName: newEmbryoForm.siteName.trim() || 'Main Hospital',
      status: 'Stored',
      embryoGrading: '4AA',
      description: newEmbryoForm.description.trim() || null,
      injectionMethod: newEmbryoForm.injectionMethod || undefined,
      spermQuality: newEmbryoForm.spermQuality || undefined,
      oocytesQuality: newEmbryoForm.oocytesQuality || undefined,
      cycleType: newEmbryoForm.cycleType || undefined,
      incubatorCode: selectedIncubator?.incubator_code ?? selectedIncubator?.external_id ?? undefined,
      chamberPosition: newEmbryoForm.chamberPosition || undefined,
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
    const cleaved = selectedEmbryologyLogs.filter((row) => row.day3Label && row.day3Label !== '—').length;
    const day3GoodGrade = selectedEmbryologyLogs.filter((row) => row.day3Fragmentation === '1' || row.day3Fragmentation === '0').length;
    const blastRows = selectedEmbryologyLogs.filter((row) => (row.day5Label && row.day5Label !== '—') || (row.day6Label && row.day6Label !== '—')).length;
    const blastGoodGrades = selectedEmbryologyLogs
      .filter((row) => (row.day5Label && row.day5Label !== '—') || (row.day6Label && row.day6Label !== '—'))
      .map((row) => row.day5Label && row.day5Label !== '—' ? `D5×${row.day5Label}` : `D6×${row.day6Label}`)
      .join(', ');
    const frozenRows = selectedEmbryologyLogs.filter((row) => row.fate.toLowerCase() === 'freeze').length;
    return { totalRows, fertilized, cleaved, day3GoodGrade, blastRows, blastGoodGrades, frozenRows };
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
    <PageLayout
      title="Embryo Grading"
      icon={EmbryosIcon}
      actions={
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <FilterPanel activeCount={activeFilterCount}>
              <FilterToggle
                label="Direction"
                value={direction}
                onChange={(val) => setDirection(val as "fresh" | "frozen")}
                options={[
                  { label: 'Fresh', value: 'fresh' },
                  { label: 'Frozen', value: 'frozen' },
                ]}
              />
              <FilterSelect
                label="Branch"
                value={selectedBranch}
                onChange={setSelectedBranch}
                options={branchOptions}
                allLabel="All Branches"
              />
              <FilterSelect
                label="Status"
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={statusOptions}
                allLabel="All Statuses"
              />
            </FilterPanel>
          </div>
          <button
            type="button"
            onClick={() => setIsAddEmbryoFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#6b1176] text-white rounded-md text-sm font-semibold hover:bg-[#5a0f66] transition-colors"
          >
            + Add Cycle
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto overflow-x-hidden min-h-0">

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 gap-3 lg:gap-6 min-h-0 lg:flex-1 lg:grid-cols-[380px_1fr] items-start">
            {/* Left Panel - Filters and Embryo List */}
            <div className="flex flex-col gap-3 lg:gap-6 min-w-0">
              {/* Filters Section — desktop only */}
              <div className="hidden md:flex flex-col gap-3 bg-white border border-[#E7E1E1] rounded-lg px-3 py-3 w-full shrink-0">
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

                  <FilterSelect
                    label="Branch"
                    value={selectedBranch}
                    onChange={setSelectedBranch}
                    options={branchOptions}
                    allLabel="All Branches"
                  />
                  <FilterSelect
                    label="Status"
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    options={statusOptions}
                    allLabel="All Statuses"
                  />
                </div>
              </div>

              {/* Active Embryos List */}
              <div className="bg-white border border-[#E7E1E1] rounded-lg p-3 w-full flex-1 flex flex-col overflow-hidden min-h-80">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-black text-base">
                  Active Embryos
                  </h2>
                  <span className="text-xs font-medium text-[#6b1176] bg-[#F7ECFF] px-2 py-1 rounded-full">{filteredEmbryos.length}</span>
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
                            isSelected ? 'bg-[#F7ECFF]' : ''
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

            {/* Right Panel - Log Sheet or Status Overview */}
            {isDetailView ? (
            <div className="flex flex-col gap-6 min-w-0 w-full h-full min-h-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-full">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Embryology Log Sheet</h2>
                    {selectedEmbryo && (
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedEmbryo.hisNumber} - Cryolock {selectedEmbryo.cryolockNum}
                        {selectedEmbryo.patientName && <span className="ml-2 text-gray-400">· {selectedEmbryo.patientName}</span>}
                        {selectedEmbryo.siteName && <span className="ml-2 text-gray-400">· {selectedEmbryo.siteName}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                  {selectedEmbryo && (
                    <button
                      type="button"
                      onClick={() => navigate(`/embryo-grading/${selectedEmbryo.hisNumber}/advanced`, {
                        state: {
                          embryo: selectedEmbryo,
                          logs: selectedEmbryologyLogs,
                        },
                      })}
                      className="px-3 py-2 rounded-md bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0f62] transition-colors"
                    >
                      Start Embryo Grading
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectedEmbryo(null); navigate('/embryo-grading'); }}
                    className="p-2 rounded-md border border-[#E7E1E1] text-gray-500 hover:bg-gray-50 transition-colors"
                    title="Close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {selectedEmbryo ? (
                    <div className="space-y-4">
                      {/* Cycle Journey — single panoramic card */}
                      {(() => {
                        const totalOocytes = (selectedEmbryo.oocyte_m2 ?? 0) + (selectedEmbryo.oocyte_m1 ?? 0) + (selectedEmbryo.oocyte_gv ?? 0) + (selectedEmbryo.oocyte_others ?? 0);
                        const injected = selectedEmbryo.embryo_count ?? 0;
                        const pct = (n: number, of: number) => of > 0 ? Math.round((n / of) * 100) : 0;
                        const stages = [
                          { label: 'Oocytes',   value: totalOocytes,              base: totalOocytes,              bar: 'from-[#c084fc] to-[#a855f7]' },
                          { label: 'Injected',  value: injected,                  base: totalOocytes,              bar: 'from-[#d8b4fe] to-[#9c3aa6]' },
                          { label: 'Fertilized',value: logSummary.fertilized,     base: injected,                  bar: 'from-[#f9a8d4] to-[#ec4899]' },
                          { label: 'Cleaved',   value: logSummary.cleaved,        base: logSummary.fertilized,     bar: 'from-[#fcd34d] to-[#f59e0b]' },
                          { label: 'Day 3 Good',value: logSummary.day3GoodGrade,  base: logSummary.cleaved,        bar: 'from-[#86efac] to-[#22c55e]' },
                          { label: 'Blast',     value: logSummary.blastRows,      base: logSummary.day3GoodGrade,  bar: 'from-[#7dd3fc] to-[#0ea5e9]' },
                        ];
                        const breakdown = [
                          { label: 'M2',     value: selectedEmbryo.oocyte_m2 ?? 0,     color: 'text-white' },
                          { label: 'M1',     value: selectedEmbryo.oocyte_m1 ?? 0,     color: 'text-white' },
                          { label: 'GV',     value: selectedEmbryo.oocyte_gv ?? 0,     color: 'text-white/80' },
                          { label: 'Others', value: selectedEmbryo.oocyte_others ?? 0, color: 'text-white/80' },
                        ];
                        return (
                          <div className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-[#3b0764] via-[#6b1176] to-[#4a044e] border border-[#9c3aa6]/40">
                            <div className="flex divide-x divide-white/10">
                              {stages.map((s, i) => (
                                <div key={s.label} className="flex-1 flex flex-col items-center px-3 py-4 relative">
                                  <div className="absolute bottom-0 left-0 right-0 h-[6px] bg-white/10">
                                    <div className={`h-full bg-gradient-to-r ${s.bar} transition-all duration-700`} style={{ width: `${pct(s.value, s.base)}%` }} />
                                  </div>
                                  <span className="text-xs font-extrabold uppercase tracking-widest mb-2 text-[#e9d5ff]">{s.label}</span>
                                  <span className="text-3xl font-black text-white leading-none tabular-nums">{s.value}</span>
                                  {i > 0 ? (
                                    <span className="mt-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/10 text-[#e9d5ff]">
                                      {pct(s.value, s.base)}%
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                                      {breakdown.map((b) => (
                                        <span key={b.label} className={`text-[10px] font-bold ${b.color}`}>
                                          {b.value} <span className="font-bold text-white/80">{b.label}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div className="flex-1 flex flex-col items-center px-3 py-4">
                                <span className="text-xs font-extrabold uppercase tracking-widest mb-2 text-[#e9d5ff]">Good Grade</span>
                                <span className="text-sm font-black text-white leading-snug text-center">{logSummary.blastGoodGrades || '—'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {(() => {
                        const rawDay = calculateDayInCycle();
                        const dayNum = parseInt(rawDay.replace('Day ', ''), 10);
                        const dayDisplay = dayNum > 6 ? '6+' : rawDay;
                        return (
                          <div className="rounded-lg border border-[#E7E1E1] bg-white overflow-hidden">
                            <div className="flex divide-x divide-[#F0EAF4] overflow-x-auto">
                              <div className="px-4 py-3 bg-[#F7ECFF] min-w-[110px]">
                                <p className="text-xs font-extrabold text-[#9c3aa6] uppercase tracking-wide mb-1 whitespace-nowrap">Current Day</p>
                                <p className="text-sm font-black text-[#6b1176]">{dayDisplay}</p>
                              </div>
                              {([
                                { label: 'Injection Method',    value: selectedEmbryo.injectionMethod || '—' },
                                { label: 'Sperm Quality',       value: selectedEmbryo.spermQuality || '—' },
                                { label: 'Oocyte Quality',      value: selectedEmbryo.oocytesQuality || '—' },
                                { label: 'Type',                value: selectedEmbryo.cycleType || '—' },
                                { label: 'Incubator / Chamber', value: selectedEmbryo.incubatorCode ? `${selectedEmbryo.incubatorCode}${selectedEmbryo.chamberPosition ? ` · ${selectedEmbryo.chamberPosition}` : ''}` : '—' },
                              ] as { label: string; value: string }[]).map((item) => (
                                <div key={item.label} className="flex-1 min-w-[110px] px-4 py-3">
                                  <p className="text-xs font-extrabold uppercase tracking-wide mb-1 whitespace-nowrap text-[#9c3aa6]">{item.label}</p>
                                  <p className="text-sm font-semibold text-gray-900">{item.value}</p>
                                </div>
                              ))}
                              <div className="px-4 py-3 min-w-[110px]">
                                <p className="text-xs font-extrabold uppercase tracking-wide mb-1 whitespace-nowrap text-[#9c3aa6]">Best Grade</p>
                                <p className="text-sm font-semibold text-gray-900">{primaryGradeDetails?.grade || '—'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="rounded-lg border border-[#E7E1E1] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-[1320px] w-full text-sm">
                            <thead className="bg-[#F7ECFF] text-[#6b1176]">
                              <tr className="divide-x divide-[#E7E1E1]">
                                <th className="px-2 py-2 text-left font-semibold">Oocyte</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 1 (PN)</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 3/4</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 5</th>
                                <th className="px-2 py-2 text-left font-semibold">Day 6</th>
                                <th className="px-2 py-2 text-left font-semibold">Fate</th>
                                <th className="px-2 py-2 text-left font-semibold">Notes</th>
                                <th className="px-2 py-2 text-left font-semibold w-24 sticky right-0 z-10 bg-[#F7ECFF] border-l border-[#E7E1E1]">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedEmbryologyLogs.length === 0 ? (
                                <tr>
                                  <td colSpan={10} className="px-3 py-6 text-center text-gray-500">No log entries yet. Click Add Entry.</td>
                                </tr>
                              ) : (
                                selectedEmbryologyLogs.map((row, index) => (
                                  <tr key={row.id} className="border-t border-[#F1F1F1] hover:bg-[#FCF9FF] divide-x divide-[#E7E1E1]">
                                    <td className="px-2 py-2 whitespace-nowrap">
                                      <div className="font-medium">#{row.oocyteNo}</div>
                                      <div className="text-[10px] text-gray-400">Drop {row.day0Dish} | {row.maturity}</div>
                                    </td>
                                    <td className="px-2 py-2">{row.pn}</td>
                                    <td className="px-2 py-2 text-center">
                                      <div className="font-semibold">{row.day3Label || '—'}</div>
                                      {row.dropNo && row.dropNo !== '—' && <div className="text-[10px] text-gray-400">Drop {row.dropNo}</div>}
                                    </td>
                                    <td className={`px-2 py-2 font-semibold text-center ${getGradeColor(row.day5Label || '—')}`}>{row.day5Label || '—'}</td>
                                    <td className={`px-2 py-2 font-semibold text-center ${getGradeColor(row.day6Label || '—')}`}>{row.day6Label || '—'}</td>
                                    <td className="px-2 py-2">
                                      <div className="flex items-center gap-1.5">
                                        {row.fate === 'Freeze' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-sm font-semibold border border-sky-200">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 7l-5 5-5-5"/><path d="M17 17l-5-5-5 5"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M7 7l5 5 5-5"/><path d="M7 17l5-5 5 5"/></svg>
                                            Freeze
                                          </span>
                                        ) : row.fate === 'Transfer' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-200">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                                            Transfer
                                          </span>
                                        ) : row.fate === 'Discard' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-sm font-semibold border border-red-200">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                            Discard
                                          </span>
                                        ) : (
                                          <span className="text-gray-400">—</span>
                                        )}
                                        {row.fate === 'Freeze' && row.fzNo && row.fzNo !== '—' && (
                                          <span className="text-xs text-gray-400 font-medium">#{row.fzNo}</span>
                                        )}
                                      </div>
                                    </td>
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
                                            fate: row.fate === '—' ? '' : (row.fate || ''),
                                            fzNo: row.fzNo === '—' ? '' : (row.fzNo || ''),
                                            notes: row.notes === '—' ? '' : (row.notes || ''),
                                          });
                                          setEditingLogId(row.id);
                                          setLogModalStep(0);
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
                            className="px-2.5 py-1.5 rounded bg-[#6b1176] text-white text-sm font-medium hover:bg-[#5a0f62] transition-colors"
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
            ) : (
            <div className="order-first lg:order-last w-full flex flex-col gap-4">

              {/* ── Embryo Snapshot ── */}
              <div className="rounded-lg border border-[#E7E1E1] bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">Status Overview</p>
                    <p className="text-sm font-bold text-[#6b1176] mt-0.5">Embryo Snapshot</p>
                  </div>
                  <span className="text-[10px] bg-green-50 text-green-700 font-semibold px-2.5 py-1 rounded-full border border-green-200">Live</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: "Total", value: embryoStats.total, sub: "embryos", border: "border-[#E8E1F0]", from: "from-[#FCF9FF]", to: "to-[#F8F4FD]", val: "text-black" },
                    { label: "Stored", value: embryoStats.stored, sub: "in storage", border: "border-[#E6F4EC]", from: "from-[#F5FCF8]", to: "to-[#EEFAF6]", val: "text-emerald-700" },
                    { label: "In Transit", value: embryoStats.inTransit, sub: "moving", border: "border-[#FFF3CD]", from: "from-[#FFF8E9]", to: "to-[#FFF5DB]", val: "text-amber-700" },
                    { label: "Thawed", value: embryoStats.thawed, sub: "for transfer", border: "border-[#DDEFFA]", from: "from-[#F4FAFF]", to: "to-[#EBF7FF]", val: "text-sky-700" },
                    { label: "High Grade", value: embryoStats.highGrade, sub: "4AA / 4AB / 4BA", border: "border-[#F5EFF9]", from: "from-[#FCF7FF]", to: "to-[#F9F1FE]", val: "text-[#6b1176]" },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-lg border ${s.border} bg-gradient-to-br ${s.from} ${s.to} px-4 py-3 flex flex-col`}>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
                      <p className={`text-3xl font-bold ${s.val} leading-none mt-1`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{s.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Today's Queue + Grade Distribution ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Today's Queue */}
                <div className="rounded-lg border border-[#E7E1E1] bg-white p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">Today's Queue</p>
                      <p className="text-sm font-bold text-black mt-0.5">Needs Attention</p>
                    </div>
                    <span className="text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">3 pending</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { his: "HIS008", name: "Rekha Mohan", task: "Day 3 Cell Count Check", due: "Due by 12:00 PM", tag: "bg-red-50 text-red-600 border-red-200", badge: "Urgent" },
                      { his: "HIS006", name: "Kavitha Murali", task: "Day 5 Blastocyst Grading", due: "Due by 2:00 PM", tag: "bg-amber-50 text-amber-600 border-amber-200", badge: "Soon" },
                      { his: "HIS007", name: "Sudha Balaji", task: "Day 6 Final Assessment", due: "Due by 4:00 PM", tag: "bg-blue-50 text-blue-600 border-blue-200", badge: "Scheduled" },
                    ].map((item) => (
                      <div
                        key={item.his}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:border-[#6b1176]/30 hover:bg-[#F7ECFF]/30 cursor-pointer transition-all"
                        onClick={() => navigate(`/embryo-grading/${item.his}`)}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
                          <p className="text-[10px] text-[#6b1176] font-medium">{item.his} · {item.task}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.due}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${item.tag}`}>{item.badge}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grade Distribution */}
                <div className="rounded-lg border border-[#E7E1E1] bg-white p-5 flex flex-col gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">Grade Distribution</p>
                    <p className="text-sm font-bold text-black mt-0.5">Current Cycle Grades</p>
                  </div>
                  {(() => {
                    const counts: Record<string, number> = {};
                    embryos.forEach((e) => {
                      const g = getPrimaryGrade(e.embryoGrading);
                      if (g && g !== 'N/A') counts[g] = (counts[g] || 0) + 1;
                    });
                    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    const barColor = (g: string) => ['4AA','4AB','4BA'].includes(g) ? 'bg-emerald-400' : ['4BB','3AA'].includes(g) ? 'bg-amber-400' : 'bg-slate-400';
                    const textColor = (g: string) => ['4AA','4AB','4BA'].includes(g) ? 'text-emerald-700' : ['4BB','3AA'].includes(g) ? 'text-amber-700' : 'text-slate-600';
                    return (
                      <div className="space-y-2.5">
                        {sorted.map(([grade, count]) => (
                          <div key={grade} className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold w-8 shrink-0 text-right ${textColor(grade)}`}>{grade}</span>
                            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor(grade)}`} style={{ width: `${Math.round((count / total) * 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-5 shrink-0 text-right">{count}</span>
                          </div>
                        ))}
                        {sorted.length === 0 && <p className="text-xs text-gray-400">No graded embryos yet.</p>}
                        <div className="pt-2 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                          {[["bg-emerald-400","High Grade"],["bg-amber-400","Mid Grade"],["bg-slate-400","Lower Grade"]].map(([c,l]) => (
                            <span key={l} className="flex items-center gap-1 text-[10px] text-gray-500">
                              <span className={`w-2 h-2 rounded-full ${c} inline-block`} />{l}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Past Cycles ── */}
              <div className="rounded-lg border border-[#E7E1E1] bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">Past Cycles</p>
                    <p className="text-sm font-bold text-black mt-0.5">All Embryos — Previous Sessions</p>
                  </div>
                  <span className="text-[10px] font-semibold text-[#6b1176] bg-[#F7ECFF] px-2.5 py-1 rounded-full">{filteredEmbryos.length} records</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#F7ECFF]">
                        {["HIS No.", "Patient", "Cryolock", "Grade", "Site", "Vitrification", "Status", ""].map((h, i) => (
                          <th key={i} className={`text-left text-[10px] font-semibold text-[#6b1176] px-3 py-2.5 ${i === 0 ? 'rounded-l-lg' : ''} ${i === 7 ? 'rounded-r-lg' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {([
                        { his: 'HIS021', patient: 'Nithya Balaji',    cryo: 'CL021', grade: '5AA', site: 'Main Hospital',    date: '2023-11-10', status: 'Thawed',     injection: 'ICSI',  sperm: 'Good',         type: 'OG'    },
                        { his: 'HIS019', patient: 'Sangeetha Ravi',   cryo: 'CL019', grade: '4AB', site: 'Branch Clinic',   date: '2023-09-22', status: 'Stored',     injection: 'PICSI', sperm: 'Average',      type: 'DOHSP' },
                        { his: 'HIS017', patient: 'Padma Suresh',     cryo: 'CL017', grade: '3AA', site: 'Satellite Center',date: '2023-08-05', status: 'In Transit', injection: 'ICSI',  sperm: 'Good',         type: 'OG'    },
                        { his: 'HIS015', patient: 'Janaki Mohan',     cryo: 'CL015', grade: '4BB', site: 'Main Hospital',    date: '2023-06-18', status: 'Thawed',     injection: 'IMSI',  sperm: 'Poor',         type: 'DET'   },
                        { his: 'HIS013', patient: 'Revathi Kumar',    cryo: 'CL013', grade: '4AA', site: 'Branch Clinic',   date: '2023-04-30', status: 'Stored',     injection: 'ICSI',  sperm: 'Good',         type: 'OG'    },
                        { his: 'HIS011', patient: 'Usha Narayanan',   cryo: 'CL011', grade: '2BB', site: 'Main Hospital',    date: '2023-03-14', status: 'Thawed',     injection: 'PICSI', sperm: 'Average (NI)', type: 'DOHSP' },
                        { his: 'HIS009', patient: 'Deepa Venkatesh',  cryo: 'CL009', grade: '4BA', site: 'Satellite Center',date: '2023-01-27', status: 'Stored',     injection: 'ICSI',  sperm: 'Good',         type: 'OG'    },
                        { his: 'HIS007', patient: 'Amala Chandran',   cryo: 'CL007', grade: '3AB', site: 'Branch Clinic',   date: '2022-12-09', status: 'In Transit', injection: 'IMSI',  sperm: 'Average',      type: 'OG'    },
                      ] as { his: string; patient: string; cryo: string; grade: string; site: string; date: string; status: string; injection: string; sperm: string; type: string }[]).map((r, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors cursor-pointer">
                          <td className="px-3 py-2.5 text-xs font-semibold text-[#6b1176]">{r.his}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[120px] truncate">{r.patient}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-600">{r.cryo}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getGradeChipStyle(r.grade)}`}>{r.grade}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[100px] truncate">{r.site}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              r.status === 'Stored'     ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : r.status === 'In Transit' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : r.status === 'Thawed'    ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>{r.status}</span>
                          </td>
                          <td className="px-3 py-2.5 text-[10px] text-[#6b1176] font-semibold">View →</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Recent Activity ── */}
              <div className="rounded-lg border border-[#E7E1E1] bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7892]">Recent Activity</p>
                    <p className="text-sm font-bold text-black mt-0.5">Lab Event Log</p>
                  </div>
                  <button className="text-xs text-[#6b1176] font-semibold hover:underline">View All</button>
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-4 pl-10">
                    {[
                      { time: "Today, 09:14 AM", event: "HIS001 · Day 5 blastocyst graded 4AA — High Grade", user: "Dr. Priya S.", dot: "bg-emerald-100 text-emerald-700", label: "G" },
                      { time: "Today, 08:52 AM", event: "HIS006 · Day 3 check — 8 cells, <10% fragmentation, symmetric", user: "Lab Tech Ravi", dot: "bg-[#F7ECFF] text-[#6b1176]", label: "✓" },
                      { time: "Yesterday, 05:45 PM", event: "HIS002 · Status changed to In Transit (Tambaram → Egmore)", user: "Dr. Meena R.", dot: "bg-amber-100 text-amber-700", label: "T" },
                      { time: "Yesterday, 02:15 PM", event: "HIS004 · Thawed for FET — warming protocol initiated", user: "Dr. Anand K.", dot: "bg-orange-100 text-orange-700", label: "❄" },
                      { time: "May 06, 10:00 AM", event: "HIS008 · New cycle created — 10 oocytes retrieved (8 MII)", user: "Dr. Priya S.", dot: "bg-blue-100 text-blue-700", label: "+" },
                    ].map((item, i) => (
                      <div key={i} className="relative flex gap-3">
                        <div className={`absolute -left-6 w-4 h-4 rounded-full ${item.dot} flex items-center justify-center shrink-0 text-[9px] font-bold`} style={{ top: 2 }}>
                          {item.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 font-medium leading-snug">{item.event}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{item.time}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{item.user}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
            )}
          </div>
        </div>

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
            <input className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm" placeholder="Patient Name" value={newEmbryoForm.patientName} onChange={(e) => handleNewEmbryoFieldChange('patientName', e.target.value)} />
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700"
              value={newEmbryoForm.injectionMethod}
              onChange={(e) => handleNewEmbryoFieldChange('injectionMethod', e.target.value)}
            >
              <option value="">Method of Injection</option>
              <option value="ICSI">ICSI</option>
              <option value="PICSI">PICSI</option>
              <option value="IMSI">IMSI</option>
            </select>
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700"
              value={newEmbryoForm.spermQuality}
              onChange={(e) => handleNewEmbryoFieldChange('spermQuality', e.target.value)}
            >
              <option value="">Sperm Quality</option>
              <option value="Good">Good</option>
              <option value="Average">Average</option>
              <option value="Average (NI)">Average (NI)</option>
              <option value="Poor">Poor</option>
            </select>
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700"
              value={newEmbryoForm.oocytesQuality}
              onChange={(e) => handleNewEmbryoFieldChange('oocytesQuality', e.target.value)}
            >
              <option value="">Oocytes Quality</option>
              <option value="Good">Good</option>
              <option value="Average">Average</option>
              <option value="Average to Poor">Average to Poor</option>
              <option value="Poor">Poor</option>
            </select>
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700"
              value={newEmbryoForm.cycleType}
              onChange={(e) => handleNewEmbryoFieldChange('cycleType', e.target.value)}
            >
              <option value="">Type</option>
              <option value="DOHSP">Donor Oocytes with Husband's Sperm (DOHSP)</option>
              <option value="OG">Own Gametes (OG)</option>
              <option value="DET">Donor Embryo (DET)</option>
            </select>
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700 disabled:opacity-50"
              value={newEmbryoForm.branch_id ?? ""}
              disabled={branchesLoading}
              onChange={(e) => {
                const selected = branches.find(b => String(b.branch_id) === e.target.value);
                handleNewEmbryoFieldChange('branch_id', e.target.value ? Number(e.target.value) : null);
                handleNewEmbryoFieldChange('siteName', selected?.branch_name ?? "");
                handleNewEmbryoFieldChange('incubator_id', null);
                handleNewEmbryoFieldChange('chamberPosition', '');
                setSelectedIncubator(null);
                if (selected?.branch_name) {
                  setIncubatorsLoading(true);
                  shipmentService.getActiveIncubators({ branch_name: selected.branch_name })
                    .then(res => {
                      const list = res.branches.find(b => b.branch_name === selected.branch_name)?.incubators ?? [];
                      setIncubators(list);
                    })
                    .catch(() => setIncubators([]))
                    .finally(() => setIncubatorsLoading(false));
                } else {
                  setIncubators([]);
                }
              }}
            >
              <option value="">{branchesLoading ? "Loading branches..." : "Select Branch"}</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-[#E7E1E1] px-3 text-sm bg-white text-gray-700 disabled:opacity-50"
              value={newEmbryoForm.incubator_id ?? ""}
              disabled={incubatorsLoading || !newEmbryoForm.branch_id}
              onChange={(e) => {
                const inc = incubators.find(i => String(i.incubator_id) === e.target.value) ?? null;
                handleNewEmbryoFieldChange('incubator_id', e.target.value ? Number(e.target.value) : null);
                handleNewEmbryoFieldChange('tankCode', inc?.incubator_code ?? inc?.external_id ?? '');
                handleNewEmbryoFieldChange('chamberPosition', '');
                setSelectedIncubator(inc);
              }}
            >
              <option value="">
                {incubatorsLoading ? "Loading incubators..." : !newEmbryoForm.branch_id ? "Select branch first" : "Select Incubator"}
              </option>
              {incubators.map(i => (
                <option key={i.incubator_id} value={i.incubator_id}>
                  {i.incubator_code || i.external_id || `Incubator #${i.incubator_id}`}
                </option>
              ))}
            </select>
          </div>

          {/* Chamber position picker */}
          {selectedIncubator && selectedIncubator.chamber_r && selectedIncubator.chamber_c && (
            <div className="rounded-lg border border-[#E7E1E1] p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Select Chamber Position
                {newEmbryoForm.chamberPosition && (
                  <span className="ml-2 text-[#6b1176]">— Slot {newEmbryoForm.chamberPosition} selected</span>
                )}
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${selectedIncubator.chamber_c}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: selectedIncubator.chamber_r }).map((_, r) =>
                  Array.from({ length: selectedIncubator.chamber_c! }).map((_, c) => {
                    const pos = String(r * selectedIncubator.chamber_c! + c + 1);
                    const active = newEmbryoForm.chamberPosition === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => handleNewEmbryoFieldChange('chamberPosition', active ? '' : pos)}
                        className={`h-9 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          active
                            ? 'bg-[#6b1176] text-white scale-105'
                            : 'bg-white text-gray-500 border border-gray-200 hover:border-[#6b1176] hover:text-[#6b1176] hover:scale-105'
                        }`}
                      >
                        {pos}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Oocyte injection count table */}
          <div className="overflow-x-auto rounded-md border border-[#E7E1E1]">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="bg-gray-50 border-b border-[#E7E1E1]">
                  {(['M2', 'M1', 'GV', 'OTHERS', 'INJECTED', 'OOCYTES'] as const).map((col) => (
                    <React.Fragment key={col}>
                      {col === 'OOCYTES' && <th className="text-gray-300 font-light px-0">/</th>}
                      <th className="px-3 py-2 font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{col}</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {([
                    { key: 'm2' },
                    { key: 'm1' },
                    { key: 'gv' },
                    { key: 'others' },
                    { key: 'injected' },
                    { key: 'oocytes' },
                  ] as { key: keyof NewEmbryoFormState }[]).map(({ key }) => {
                    const isInjected = key === 'injected' || key === 'oocytes';
                    return (
                      <React.Fragment key={key}>
                        {key === 'oocytes' && <td className="text-gray-300 text-sm px-0 text-center">/</td>}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={isInjected ? undefined : 99}
                            disabled={isInjected}
                            className={`w-full min-w-[48px] h-8 rounded border px-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-[#8b2a96] ${isInjected ? 'border-[#E7E1E1] bg-gray-50 text-gray-500 cursor-not-allowed font-semibold' : 'border-[#E7E1E1]'}`}
                            value={newEmbryoForm[key] as string}
                            onChange={(e) => handleNewEmbryoFieldChange(key, e.target.value)}
                          />
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
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
        containerClassName="w-full max-w-[680px]"
      >
        {(() => {
          const inp = "w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#9c3aa6]/30 focus:border-[#9c3aa6] bg-white";
          const sel = inp;
          const lbl = "block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
          const day6Locked = logForm.day5Stage === 'Blastocyst';
          const blastGradeFields5 = logForm.day5ExpansionGrade && logForm.day5IcmGrade && logForm.day5TeGrade;
          const blastGradeFields6 = logForm.day6ExpansionGrade && logForm.day6IcmGrade && logForm.day6TeGrade;

          const STEP_BASE = { activeBg: 'bg-[#6b1176]', doneBg: 'bg-[#9c3aa6]', ring: 'ring-[#9c3aa6]', lineActive: 'bg-[#e9d5ff]', textActive: 'text-[#6b1176]', border: 'border-[#E7E1E1]', headerBg: 'bg-gradient-to-r from-[#3b0764] to-[#6b1176]', chipCls: 'bg-[#F7ECFF] border-[#c084fc]/40 text-[#6b1176]' };
          const STEPS = [
            { label: 'Day 0', sub: 'Fertilization',                  ...STEP_BASE },
            { label: 'Day 3', sub: 'Cleavage',                       ...STEP_BASE },
            { label: 'Day 5', sub: 'Blastocyst',                     ...STEP_BASE },
            { label: 'Day 6', sub: day6Locked ? 'N/A' : 'Late Blast', ...STEP_BASE, activeBg: day6Locked ? 'bg-gray-400' : 'bg-[#6b1176]', headerBg: day6Locked ? 'bg-gray-400' : 'bg-gradient-to-r from-[#3b0764] to-[#6b1176]' },
            { label: 'Final', sub: 'Decision',                       ...STEP_BASE },
          ];

          const stepSummary = (i: number): string => {
            if (i === 0) { const p: string[] = []; if (logForm.day0Dish) p.push(`Dish ${logForm.day0Dish}`); if (logForm.dropNo) p.push(`Drop ${logForm.dropNo}`); if (logForm.pn) p.push(logForm.pn); return p.join(' · ') || '—'; }
            if (i === 1) { const l = generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation); return l !== '—' ? l : (logForm.day3CellCount ? `${logForm.day3CellCount}C` : '—'); }
            if (i === 2) { if (logForm.day5Stage === 'Blastocyst' && blastGradeFields5) return generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade); return logForm.day5Stage || '—'; }
            if (i === 3) { if (day6Locked) return 'N/A'; if (logForm.day6Stage === 'Blastocyst' && blastGradeFields6) return generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade); return logForm.day6Stage || '—'; }
            return logForm.fate || '—';
          };

          const s = STEPS[logModalStep];

          return (
            <div className="flex flex-col gap-4">
              {/* Identity bar */}
              <div className="rounded-2xl bg-gradient-to-br from-[#3b0764] via-[#6b1176] to-[#4a044e] border border-[#9c3aa6]/40 shadow-lg px-5 py-3 flex items-center justify-between">
                {/* Left: HIS + Patient Name */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#e9d5ff]/60">HIS</span>
                  <p className="text-white font-bold text-sm leading-tight">{selectedEmbryo?.hisNumber || '—'}</p>
                  <p className="text-[#e9d5ff]/70 text-xs mt-0.5">{selectedEmbryo?.patientName || '—'}</p>
                </div>

                {/* Right: Oocyte No + Maturity */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#e9d5ff]/60 mb-1">Oocyte No</span>
                    <input
                      className="bg-transparent border border-white/30 rounded-lg text-white font-bold text-sm w-20 h-8 px-2 text-center focus:outline-none focus:border-white/70 placeholder:text-white/30"
                      placeholder="#"
                      value={logForm.oocyteNo}
                      onChange={(e) => handleLogFieldChange('oocyteNo', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#e9d5ff]/60 mb-1">Maturity</span>
                    <select
                      className="bg-white/10 border border-white/30 rounded-lg text-white text-sm font-semibold w-20 h-8 px-2 focus:outline-none focus:border-white/70"
                      value={logForm.maturity}
                      onChange={(e) => handleLogFieldChange('maturity', e.target.value)}
                    >
                      <option value="MII" className="text-black">MII</option>
                      <option value="MI" className="text-black">MI</option>
                      <option value="GV" className="text-black">GV</option>
                      <option value="—" className="text-black">—</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-start">
                {STEPS.map((step, i) => (
                  <React.Fragment key={step.label}>
                    <button
                      type="button"
                      className="flex flex-col items-center gap-1 min-w-[52px] focus:outline-none group"
                      onClick={() => setLogModalStep(i)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                        i < logModalStep
                          ? `${step.doneBg} text-white`
                          : i === logModalStep
                          ? `${step.activeBg} text-white ring-2 ${step.ring} ring-offset-2 scale-110`
                          : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                      }`}>
                        {i < logModalStep ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        ) : (
                          <span>{i + 1}</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wide leading-none mt-1 ${i === logModalStep ? step.textActive : 'text-gray-400'}`}>{step.label}</span>
                      <span className={`text-[9px] leading-none ${i === logModalStep ? step.textActive + '/80' : 'text-gray-300'}`}>{step.sub}</span>
                    </button>
                    {i < 4 && (
                      <div className={`flex-1 h-0.5 mt-4 transition-colors duration-300 ${i < logModalStep ? step.lineActive : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Completed step chips */}
              {logModalStep > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {STEPS.slice(0, logModalStep).map((step, i) => (
                    <button
                      key={step.label}
                      type="button"
                      onClick={() => setLogModalStep(i)}
                      className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all hover:scale-105 ${step.chipCls}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="opacity-60 uppercase tracking-wide">{step.label}</span>
                      <span className="font-black">{stepSummary(i)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active step form */}
              <div className={`rounded-xl border ${s.border} overflow-hidden shadow-sm`}>
                <div className={`${s.headerBg} px-4 py-3 flex items-center justify-between`}>
                  <div>
                    <p className="text-white font-black text-sm tracking-tight">{s.label}</p>
                    <p className="text-white/70 text-[11px]">{s.sub}</p>
                  </div>
                  <span className="text-white/50 text-xs font-semibold">{logModalStep + 1} / 5</span>
                </div>
                <div className="bg-white p-5">

                  {/* Day 0 */}
                  {logModalStep === 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className={lbl}>Dish No</label><input className={inp} placeholder="Dish number" value={logForm.day0Dish} onChange={(e) => handleLogFieldChange('day0Dish', e.target.value)} /></div>
                      <div><label className={lbl}>Drop No</label><input className={inp} placeholder="Drop number" value={logForm.dropNo} onChange={(e) => handleLogFieldChange('dropNo', e.target.value)} /></div>
                      <div>
                        <label className={lbl}>PN Status</label>
                        <select className={sel} value={logForm.pn} onChange={(e) => handleLogFieldChange('pn', e.target.value)}>
                          <option value="2PN">2PN ✓</option>
                          <option value="1PN">1PN</option>
                          <option value="3PN">3PN</option>
                          <option value="0PN">0PN</option>
                          <option value="Degenerated">Degenerated</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Zygote Status</label>
                        <select className={sel} value={logForm.day0ZygoteStatus} onChange={(e) => handleLogFieldChange('day0ZygoteStatus', e.target.value)}>
                          <option value="">—</option>
                          <option value="Normal">Normal</option>
                          <option value="Abnormal">Abnormal</option>
                        </select>
                      </div>
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 0 notes…" value={logForm.day0Notes} onChange={(e) => handleLogFieldChange('day0Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 3 */}
                  {logModalStep === 1 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={lbl}>Cell Count</label>
                        <select className={sel} value={logForm.day3CellCount} onChange={(e) => handleLogFieldChange('day3CellCount', e.target.value)}>
                          <option value="">—</option>
                          {['2','3','4','5','6','7','8','9+'].map(v => <option key={v} value={v}>{v} cells</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Fragmentation</label>
                        <select className={sel} value={logForm.day3Fragmentation} onChange={(e) => handleLogFieldChange('day3Fragmentation', e.target.value)}>
                          <option value="">—</option>
                          <option value="1">Grade 1 (≤10%)</option>
                          <option value="2">Grade 2 (10–25%)</option>
                          <option value="3">Grade 3 (25–50%)</option>
                          <option value="4">Grade 4 (&gt;50%)</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Symmetry</label>
                        <select className={sel} value={logForm.day3Symmetry} onChange={(e) => handleLogFieldChange('day3Symmetry', e.target.value)}>
                          <option value="">—</option>
                          <option value="Even">Even</option>
                          <option value="Slightly uneven">Slightly uneven</option>
                          <option value="Uneven">Uneven</option>
                        </select>
                      </div>
                      {logForm.day3CellCount && logForm.day3Fragmentation && (
                        <div className="flex items-end">
                          <div className="w-full rounded-xl bg-[#F7ECFF] border border-[#c084fc]/40 px-3 py-2.5 text-center">
                            <span className="text-[10px] text-[#9c3aa6] uppercase tracking-wide block mb-0.5">Auto Grade</span>
                            <span className="text-2xl font-black text-[#6b1176]">{generateDay3Label(logForm.day3CellCount, logForm.day3Fragmentation)}</span>
                          </div>
                        </div>
                      )}
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Day 3 notes…" value={logForm.day3Notes} onChange={(e) => handleLogFieldChange('day3Notes', e.target.value)} /></div>
                    </div>
                  )}

                  {/* Day 5 */}
                  {logModalStep === 2 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className={lbl}>Stage</label>
                        <select className={sel} value={logForm.day5Stage} onChange={(e) => handleLogFieldChange('day5Stage', e.target.value)}>
                          <option value="">—</option>
                          <option value="Cleavage">Cleavage</option>
                          <option value="Morula">Morula</option>
                          <option value="Early Blast">Early Blast</option>
                          <option value="Blastocyst">Blastocyst ⭐</option>
                        </select>
                      </div>
                      {logForm.day5Stage === 'Blastocyst' && (<>
                        <div>
                          <label className={lbl}>Expansion Grade</label>
                          <select className={sel} value={logForm.day5ExpansionGrade} onChange={(e) => handleLogFieldChange('day5ExpansionGrade', e.target.value)}>
                            <option value="">—</option>
                            {['1','2','3','4','5','6'].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>ICM Grade</label>
                          <select className={sel} value={logForm.day5IcmGrade} onChange={(e) => handleLogFieldChange('day5IcmGrade', e.target.value)}>
                            <option value="">—</option>
                            {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>TE Grade</label>
                          <select className={sel} value={logForm.day5TeGrade} onChange={(e) => handleLogFieldChange('day5TeGrade', e.target.value)}>
                            <option value="">—</option>
                            {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        {blastGradeFields5 && (
                          <div className="flex items-end">
                            <div className="w-full rounded-xl bg-[#F7ECFF] border border-[#c084fc]/40 px-3 py-2.5 text-center">
                              <span className="text-[10px] text-[#9c3aa6] uppercase tracking-wide block mb-0.5">D5 Grade</span>
                              <span className={`text-2xl font-black ${getGradeColor(generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade))}`}>{generateBlastLabel(logForm.day5ExpansionGrade, logForm.day5IcmGrade, logForm.day5TeGrade)}</span>
                            </div>
                          </div>
                        )}
                      </>)}
                    </div>
                  )}

                  {/* Day 6 */}
                  {logModalStep === 3 && (
                    day6Locked ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl mb-1">🧊</div>
                        <p className="text-sm font-semibold text-gray-500">Blastocyst reached on Day 5</p>
                        <p className="text-xs text-gray-400">Day 6 evaluation not required</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className={lbl}>Stage</label>
                          <select className={sel} value={logForm.day6Stage} onChange={(e) => handleLogFieldChange('day6Stage', e.target.value)}>
                            <option value="">—</option>
                            <option value="Cleavage">Cleavage</option>
                            <option value="Morula">Morula</option>
                            <option value="Early Blast">Early Blast</option>
                            <option value="Blastocyst">Blastocyst</option>
                          </select>
                        </div>
                        {logForm.day6Stage === 'Blastocyst' && (<>
                          <div>
                            <label className={lbl}>Expansion Grade</label>
                            <select className={sel} value={logForm.day6ExpansionGrade} onChange={(e) => handleLogFieldChange('day6ExpansionGrade', e.target.value)}>
                              <option value="">—</option>
                              {['1','2','3','4','5','6'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>ICM Grade</label>
                            <select className={sel} value={logForm.day6IcmGrade} onChange={(e) => handleLogFieldChange('day6IcmGrade', e.target.value)}>
                              <option value="">—</option>
                              {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>TE Grade</label>
                            <select className={sel} value={logForm.day6TeGrade} onChange={(e) => handleLogFieldChange('day6TeGrade', e.target.value)}>
                              <option value="">—</option>
                              {['A','B','C'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          {blastGradeFields6 && (
                            <div className="flex items-end">
                              <div className="w-full rounded-xl bg-[#F7ECFF] border border-[#c084fc]/40 px-3 py-2.5 text-center">
                                <span className="text-[10px] text-[#9c3aa6] uppercase tracking-wide block mb-0.5">D6 Grade</span>
                                <span className={`text-2xl font-black ${getGradeColor(generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade))}`}>{generateBlastLabel(logForm.day6ExpansionGrade, logForm.day6IcmGrade, logForm.day6TeGrade)}</span>
                              </div>
                            </div>
                          )}
                        </>)}
                        {logForm.day6Stage && (
                          <div className="col-span-2">
                            <label className={lbl}>Progression vs Day 5</label>
                            <select className={sel} value={logForm.day6Progression} onChange={(e) => handleLogFieldChange('day6Progression', e.target.value)}>
                              <option value="">—</option>
                              <option value="Delayed development">Delayed development</option>
                              <option value="Same as Day 5">Same as Day 5</option>
                              <option value="Improved">Improved</option>
                              <option value="Degenerated">Degenerated</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {/* Final */}
                  {logModalStep === 4 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className={lbl}>Fate</label>
                        <select className={sel} value={logForm.fate} onChange={(e) => handleLogFieldChange('fate', e.target.value)}>
                          <option value="">None</option>
                          <option value="Freeze">❄️ Freeze</option>
                          <option value="Transfer">🧬 Transfer</option>
                          <option value="Discard">❌ Discard</option>
                        </select>
                      </div>
                      {logForm.fate === 'Freeze' && (
                        <div className="col-span-2"><label className={lbl}>Freeze ID</label><input className={inp} placeholder="#1, #2…" value={logForm.fzNo} onChange={(e) => handleLogFieldChange('fzNo', e.target.value)} /></div>
                      )}
                      <div className="col-span-2"><label className={lbl}>Notes</label><input className={inp} placeholder="Final notes…" value={logForm.notes} onChange={(e) => handleLogFieldChange('notes', e.target.value)} /></div>
                    </div>
                  )}

                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center pt-1 border-t border-gray-100">
                {/* Left: Cancel */}
                <button type="button" onClick={() => { setIsAddLogFormOpen(false); resetLogForm(); setEditingLogId(null); }}
                  className="px-4 py-2.5 rounded-xl border border-[#9c3aa6]/40 text-[#6b1176] text-sm font-semibold hover:bg-[#f8f0fb] transition-colors">
                  Cancel
                </button>

                {/* Center: Back / Next */}
                <div className="flex-1 flex items-center justify-center gap-2">
                  {logModalStep > 0 && (
                    <button type="button" onClick={() => setLogModalStep(prev => prev - 1)}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 2L4 6.5l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Back
                    </button>
                  )}
                  {logModalStep < 4 && (
                    <button type="button" onClick={() => setLogModalStep(prev => prev + 1)}
                      className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                      Next
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4.5 2L9 6.5 4.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  )}
                </div>

                {/* Right: Save */}
                <button type="button" onClick={handleAddLogEntry}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#3b0764] to-[#9c3aa6] text-white text-sm font-bold shadow-md hover:opacity-90 transition-opacity">
                  {editingLogId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </PageLayout>
  );
}
