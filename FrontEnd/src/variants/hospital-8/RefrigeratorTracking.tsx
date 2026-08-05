import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Snowflake } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import { shipmentService } from '../../services/shipmentService';
import { ivfAlertsService } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import { userService } from '../../services/userService';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatBox from '../../components/StakeholderChatBox';
import RefrigeratorVisualisation from './components/RefrigeratorVisualisation';
import brandLogo from '../../assets/mGScale.svg';

type RefrigeratorZone = { zone_id: string; zone_name: string };

const THROBBER_STYLES = `
  @keyframes throb-pulse {
    0%, 100% { transform: scale(0.92); opacity: 0.9; }
    50%      { transform: scale(1.05); opacity: 1; }
  }
  @keyframes throb-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes throb-spin-rev {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-360deg); }
  }
  @keyframes throb-dots {
    0%, 80%, 100% { opacity: 0.25; }
    40%           { opacity: 1; }
  }
  @keyframes loading-word {
    0%   { opacity: 0; transform: translateY(5px); }
    16%  { opacity: 1; transform: translateY(0); }
    84%  { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-5px); }
  }
`;

const THROBBER_WORDS = [
  'Fetching Refrigerator Status',
  'Loading Zone Sensors',
  'Syncing Alerts & Tasks',
];

// Cycles through the loading phrases, fading each in and out.
const ThrobberWords: React.FC = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % THROBBER_WORDS.length), 1900);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={idx}
      className="text-xs font-semibold text-gray-500"
      style={{ animation: 'loading-word 1.9s ease-in-out' }}
    >
      {THROBBER_WORDS[idx]}
    </span>
  );
};

export default function RefrigeratorTrackingPageHospital8() {
  const { refrigeratorId: refrigeratorIdParam } = useParams<{ refrigeratorId: string }>();
  const refrigeratorIdNum = refrigeratorIdParam ? parseInt(refrigeratorIdParam, 10) : NaN;
  const hasRefrigeratorId = !Number.isNaN(refrigeratorIdNum);
  const navigate = useNavigate();

  const [refrigeratorCode, setRefrigeratorCode] = useState<string>('-');
  const [branchName, setBranchName] = useState<string>('-');
  const [refrigeratorType, setRefrigeratorType] = useState<'default' | 'cold_storage' | null>(null);
  const [isLoadingType, setIsLoadingType] = useState(true);
  const [zones, setZones] = useState<RefrigeratorZone[]>([]);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [showMessages, setShowMessages] = useState(false);
  const [showTasks, setShowTasks] = useState(false);

  // Throbber orchestration — mirrors hospital-8 Dashboard's loader fade-out
  const [loaderRevealed, setLoaderRevealed] = useState(false);
  const [hideLoader, setHideLoader] = useState(false);

  useEffect(() => {
    if (isLoadingType) {
      setLoaderRevealed(false);
      setHideLoader(false);
      return;
    }
    const t = setTimeout(() => setLoaderRevealed(true), 120);
    return () => clearTimeout(t);
  }, [isLoadingType]);

  useEffect(() => {
    if (!loaderRevealed) return;
    const t = setTimeout(() => setHideLoader(true), 650);
    return () => clearTimeout(t);
  }, [loaderRevealed]);

  useEffect(() => {
    if (!hasRefrigeratorId) {
      navigate('/refrigerator-tracking', { replace: true });
      return;
    }
  }, [hasRefrigeratorId, navigate]);

  useEffect(() => {
    userService.getProfile().then ((p) => {
      setCurrentUserName(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
      setCurrentUserId(p.user_id ?? '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasRefrigeratorId) return;
    setIsLoadingType(true);
    shipmentService.getActiveRefrigerators().then((res) => {
      for (const branch of res.branches) {
        const found = branch.refrigerators.find((r) => r.refrigerator_id === refrigeratorIdNum);
        if (found) {
          setRefrigeratorCode(found.refrigerator_code || `R${refrigeratorIdNum}`);
          setBranchName(branch.branch_name);
          if (found.type === 'cold_storage') {
            setRefrigeratorType('cold_storage');
          } else {
            setRefrigeratorType('default');
          }
          const foundZones = found.zones ?? [];
          setZones(foundZones);
          setIsLoadingType(false);
          return;
        }
      }
      setIsLoadingType(false);
    }).catch(() => {
      setIsLoadingType(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  useEffect(() => {
    if (!hasRefrigeratorId) return;
    ivfAlertsService
      .getRefrigeratorAlerts(refrigeratorIdNum)
      .then((res) => setCriticalAlerts(res.alerts || []))
      .catch(() => setCriticalAlerts([]));
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  useEffect(() => {
    fetchTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refrigeratorIdNum, hasRefrigeratorId]);

  const fetchTasks = () => {
    if (!hasRefrigeratorId) return;
    tasksService
      .getRefrigeratorTasks(refrigeratorIdNum)
      .then((res) => setTasks(res.tasks || []))
      .catch(() => setTasks([]));
  };

  const tasksCount = tasks.filter((t) => t.status === 'Not started' || t.status === 'In progress').length;
  const hasAlert = criticalAlerts.filter((a) => a.acknowledged_at == null).length > 0;

  const pageActions = (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => setShowMessages(true)}>
        <div className="relative">
          <img className="w-[25px] h-[25px]" alt="Messages" src={StakeholderChatsIcon} />
        </div>
        <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Messages</span>
      </div>

      <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => { fetchTasks(); setShowTasks(true); }}>
        <div className="relative">
          <img className="w-[25px] h-[25px]" alt="Tasks" src={MyTasksIcon} />
          {tasksCount > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
              <span className="font-semibold text-white text-[10px]">{tasksCount}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Tasks</span>
      </div>
    </div>
  );

  return (
    <>
    <div className="relative">
    <style>{THROBBER_STYLES}</style>
    <PageLayout title="Refrigerator Tracking" description="Monitor temperature, alerts and tasks for cold storage units" lucideIcon={Snowflake} actions={pageActions}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
          >
            Dashboard
          </button>
          <span className="text-gray-500">/</span>
          <button
            type="button"
            onClick={() => navigate('/refrigerator-tracking')}
            className="text-gray-500 font-semibold hover:text-gray-700 transition-colors"
          >
            Refrigerator Tracking
          </button>
          <span className="text-gray-500">/</span>
          <span className="text-black font-semibold">{refrigeratorCode}</span>
        </div>
        <div className="text-sm font-semibold text-black">
          {refrigeratorCode} - {branchName}
        </div>
      </div>


      <div className="flex-1 min-h-0">
        <RefrigeratorVisualisation
          zones={zones}
          selectedSensorId={selectedSensorId}
          onSensorSelect={setSelectedSensorId}
          hasAlert={hasAlert}
          tasks={tasks}
          onTaskCreated={fetchTasks}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          refrigeratorCode={refrigeratorCode !== '-' ? refrigeratorCode : undefined}
          refrigeratorId={hasRefrigeratorId ? refrigeratorIdNum : undefined}
          branchName={branchName !== '-' ? branchName : undefined}
          type={refrigeratorType || 'default'}
          isLoadingType={isLoadingType}
        />
      </div>
    </PageLayout>

    {!hideLoader && (
      <div
        className="absolute inset-0 z-[70] flex flex-col items-center justify-center"
        style={{
          background: 'radial-gradient(ellipse at center, #FBF8FF 0%, #F2E9FA 55%, #EADbF7 100%)',
          opacity: loaderRevealed ? 0 : 1,
          transition: 'opacity 0.6s ease',
          pointerEvents: loaderRevealed ? 'none' : 'auto',
        }}
      >
        <div className="relative flex items-center justify-center w-36 h-36">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(107,17,118,0.05) 120deg, #6b1176 340deg, transparent 360deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
              animation: 'throb-spin 1.1s linear infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              inset: 16,
              background: 'conic-gradient(from 180deg, transparent 0deg, rgba(192,132,252,0.08) 140deg, #c084fc 330deg, transparent 360deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
              animation: 'throb-spin-rev 1.6s linear infinite',
            }}
          />
          <div
            aria-label="mgSCALE"
            className="relative w-16 h-16"
            style={{
              backgroundColor: '#6b1176',
              WebkitMask: `url(${brandLogo}) center / contain no-repeat`,
              mask: `url(${brandLogo}) center / contain no-repeat`,
              animation: 'throb-pulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
        <div className="mt-7 flex flex-col items-center gap-2">
          <p className="text-sm font-black tracking-tight text-gray-800">
            mgSCALE <span className="text-gray-300 font-thin">|</span>{' '}
            <span style={{ color: '#6b1176' }}>ColdSense</span>
          </p>
          <div className="h-4 flex items-center justify-center">
            <ThrobberWords />
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: '#6b1176',
                  animation: 'throb-dots 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    )}
    </div>

    <StakeholderChatBox
      isOpen={showMessages}
      onClose={() => setShowMessages(false)}
      refrigeratorId={hasRefrigeratorId ? refrigeratorIdNum : undefined}
    />

    <MyTasksModal
      isOpen={showTasks}
      onClose={() => setShowTasks(false)}
      tasks={tasks.map((t) => ({
        id: String(t.id),
        patientId: t.patient_id ?? '',
        canisterNumber: t.tank_code ?? '',
        tankCode: t.tank_code ?? undefined,
        tankId: t.tank_id ?? undefined,
        refrigeratorId: t.refrigerator_id ?? undefined,
        assigneeId: t.assignee?.user_id ?? undefined,
        taskName: t.task_name,
        description: t.description ?? '',
        assigneeBy: t.created_by ? `${t.created_by.first_name ?? ''} ${t.created_by.last_name ?? ''}`.trim() : '',
        assignedTo: t.assignee ? `${t.assignee.first_name ?? ''} ${t.assignee.last_name ?? ''}`.trim() : '',
        dueDate: t.due_date ?? '',
        priority: (t.priority as 'Low' | 'Medium' | 'High') ?? 'Medium',
        status: (t.status as 'Not started' | 'In progress' | 'Done' | 'Cancelled') ?? 'Not started',
      }))}
      loading={false}
      variant="refrigerator"
      currentUserName={currentUserName}
      currentUserId={currentUserId}
      defaultRefrigeratorId={hasRefrigeratorId ? refrigeratorIdNum : undefined}
      onTaskCreated={fetchTasks}
      onAdd={() => {}}
      onEdit={async (task: MyTask) => {
        const taskId = parseInt(task.id, 10);
        if (task.assigneeBy?.trim().toLowerCase() === currentUserName?.trim().toLowerCase()) {
          await tasksService.updateTask(taskId, {
            task_name: task.taskName,
            description: task.description,
            status: task.status as import('../../services/tasksService').TaskStatus,
          });
        } else {
          await tasksService.updateTaskStatus(taskId, task.status as import('../../services/tasksService').TaskStatus);
        }
        fetchTasks();
      }}
      onDelete={() => {}}
    />
    </>
  );
}
