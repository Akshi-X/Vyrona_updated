import { useParams, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import IVFQualityTrackingChart from '../IVFTrackShipment/sections/IVFQualityTrackingChart';
import { IVFQualityParametersTable } from '../IVFTrackShipment/sections/IVFQualityParametersTable';
import IVFTrackAndTraceMap from '../IVFTrackShipment/sections/IVFTrackAndTraceMap';
import { userService, type UserProfileDto } from '../../services/userService';
// Header icons & modals
import CriticalAlertsIcon from '../../assets/DashBoardIcons/Critical_Alerts.svg';
import StakeholderChatsIcon from '../../assets/DashBoardIcons/Stakeholder_Chats.svg';
import MyTasksIcon from '../../assets/DashBoardIcons/My_Tasks.svg';
import CriticalAlertsModal from '../../components/CriticalAlertsModal';
import MyTasksModal, { type MyTask } from '../../components/MyTasksModal';
import StakeholderChatsModal from '../../components/StakeholderChatsModal';
import { ivfAlertsService, type IVFAlert } from '../../services/ivfAlertsService';
import { tasksService, type Task } from '../../services/tasksService';
import StakeholderChatBox from '../../components/StakeholderChatBox';
import { useDashboardChatWebSocket } from '../../hooks/useChatWebSocket';

export default function OutboundQualityTrackingPage() {
    const { canisterId } = useParams<{ canisterId: string }>();
    const { logout, userRole } = useAuth();
    const navigate = useNavigate();
    const [userInitials, setUserInitials] = useState<string>('U');
    
    // Header interactions state
    const [showCriticalAlerts, setShowCriticalAlerts] = useState(false);
    const [showMyTasks, setShowMyTasks] = useState(false);
    const [showStakeholderChats, setShowStakeholderChats] = useState(false);
    const [showStakeholderChatScreen, setShowStakeholderChatScreen] = useState(false);
    const [criticalAlerts, setCriticalAlerts] = useState<IVFAlert[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [loadingAlerts, setLoadingAlerts] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [currentUser, setCurrentUser] = useState<UserProfileDto | null>(null);
    const [stakeholderChats, setStakeholderChats] = useState<Array<{ id: string; sender: string; patientId: string; message: string; timestamp: string; isRead: boolean }>>([]);

    // WebSocket for unread count
    const { unreadMessages: wsUnreadMessages } = useDashboardChatWebSocket();

    // Calculate stakeholder chat count: only show count if canister has tagged unread messages
    const stakeholderChatCount = React.useMemo(() => {
        if (!canisterId || !wsUnreadMessages) return 0;
        // Count only tagged unread messages for this specific canister (IVF flow uses canister_number)
        return wsUnreadMessages.filter(msg => 
            msg.canister_number === canisterId || msg.patient_id === canisterId
        ).length;
    }, [canisterId, wsUnreadMessages]);
    
    const criticalAlertsCount = criticalAlerts.length;
    const myTasksCount = myTasks.length;

    const fetchCriticalAlerts = async () => {
        setLoadingAlerts(true);
        try {
            // If canisterId is available, fetch canister-specific alerts
            // Otherwise, fetch hospital-wide alerts
            if (canisterId) {
                const response = await ivfAlertsService.getCanisterAlerts(canisterId);
                setCriticalAlerts(response.alerts || []);
            } else {
                const response = await ivfAlertsService.getHospitalAlerts();
                setCriticalAlerts(response.alerts || []);
            }
        } catch (e) {
            console.error('Error fetching IVF alerts:', e);
            setCriticalAlerts([]);
        } finally {
            setLoadingAlerts(false);
        }
    };

    const fetchMyTasks = async () => {
        setLoadingTasks(true);
        try {
            let allTasks: Task[] = [];
            
            // IVF flow: if canisterId is available, use canister-specific endpoint
            // Otherwise fallback to general "my tasks"
            if (canisterId) {
                const canisterResponse = await tasksService.getCanisterTasks(canisterId);
                allTasks = Array.isArray(canisterResponse.tasks) ? canisterResponse.tasks : [];
            } else {
                const response = await tasksService.getMyTasks();
                // Combine created_tasks and assigned_tasks into a single array
                allTasks = [
                    ...(Array.isArray(response.created_tasks) ? response.created_tasks : []),
                    ...(Array.isArray(response.assigned_tasks) ? response.assigned_tasks : [])
                ];
            }
            
            // Ensure we always set an array
            setMyTasks(Array.isArray(allTasks) ? allTasks : []);
        } catch (e) {
            console.error('Error fetching tasks:', e);
            setMyTasks([]);
        } finally {
            setLoadingTasks(false);
        }
    };

    const fetchCurrentUser = async () => {
        try {
            const profile = await userService.getProfile();
            setCurrentUser(profile);
            setCurrentUserId(profile.user_id);
            const first = profile.first_name?.trim?.() || '';
            const last = profile.last_name?.trim?.() || '';
            const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
            setUserInitials(initials);
        } catch {
            // Error handled silently
        }
    };

    useEffect(() => {
        fetchCriticalAlerts();
        fetchMyTasks();
        fetchCurrentUser();
    }, [canisterId]);

    // Update stakeholder chats from WebSocket data
    useEffect(() => {
        if (wsUnreadMessages && wsUnreadMessages.length > 0) {
            const transformedChats = wsUnreadMessages
                .filter(msg => msg.canister_number === canisterId || (msg.patient_id && canisterId && msg.patient_id === canisterId))
                .map((msg) => ({
                    id: msg.canister_number || msg.patient_id || '',
                    sender: msg.sender_name,
                    patientId: msg.canister_number ? `Canister ID : ${msg.canister_number}` : (msg.patient_id ? `Canister ID : ${msg.patient_id}` : ''),
                    message: msg.message_content,
                    timestamp: new Date(msg.created_at).toLocaleString(),
                    isRead: false
                }));
            setStakeholderChats(transformedChats);
        } else {
            setStakeholderChats([]);
        }
    }, [wsUnreadMessages, canisterId]);

    return (
        <div className="bg-[#FDFAFF] flex w-full h-full">
            <Sidebar onLogout={() => { logout(); navigate('/login'); }} />
            <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto ml-60 min-h-0 pt-[63px]">
                {/* Top Nav Bar (fixed) */}
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

                {/* Main Content */}
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
                    <div className="flex items-center justify-between">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1 text-sm">
                            <button
                                type="button"
                                onClick={() => navigate('/dashboard')}
                                className="text-gray-500 text-[12px] mt-[2.5px] hover:text-gray-700 transition-colors"
                            >
                                Dashboard
                            </button>
                            <span className="text-gray-500">/</span>
                            <span className="text-black font-semibold">Outbound Quality Tracking</span>
                            {canisterId && (
                                <>
                                    <span className="text-black font-semibold">-</span>
                                    <span className="text-black font-semibold">Container ID: {canisterId}</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-6">
                            {/* Critical Alerts */}
                            <div className="relative group">
                                <img
                                    className="w-[25px] h-[25px] cursor-pointer"
                                    alt="Critical Alerts"
                                    src={CriticalAlertsIcon}
                                    onClick={() => { fetchCriticalAlerts(); setShowCriticalAlerts(true); }}
                                />
                                {criticalAlertsCount > 0 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                                        <span className="font-semibold text-white text-[10px]">{criticalAlertsCount}</span>
                                    </div>
                                )}
                                {/* Tooltip */}
                                <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                                    <div className="font-semibold text-black text-xs whitespace-nowrap">
                                        Critical Alerts
                                    </div>
                                    <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                                </div>
                            </div>
                            {/* Stakeholder Chats */}
                            <div className="relative group">
                                <img
                                    className="w-[25px] h-[25px] cursor-pointer"
                                    alt="Stakeholder Chats"
                                    src={StakeholderChatsIcon}
                                    onClick={() => setShowStakeholderChatScreen(true)}
                                />
                                {stakeholderChatCount > 0 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                                        <span className="font-semibold text-white text-[10px]">{stakeholderChatCount}</span>
                                    </div>
                                )}
                                {/* Tooltip */}
                                <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                                    <div className="font-semibold text-black text-xs whitespace-nowrap">
                                        Stakeholder Chats
                                    </div>
                                    <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                                </div>
                            </div>
                            {/* My Tasks */}
                            <div className="relative group">
                                <img
                                    className="w-[25px] h-[25px] cursor-pointer"
                                    alt="My Tasks"
                                    src={MyTasksIcon}
                                    onClick={() => { fetchMyTasks(); setShowMyTasks(true); }}
                                />
                                {myTasksCount > 0 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#ff0000] rounded-[7px] border border-solid border-white flex items-center justify-center">
                                        <span className="font-semibold text-white text-[10px]">{myTasksCount}</span>
                                    </div>
                                )}
                                {/* Tooltip */}
                                <div className="absolute top-full -left-12 mt-2 px-3 py-2 bg-white border border-[#E7E1E1] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                                    <div className="font-semibold text-black text-xs whitespace-nowrap">
                                        My Tasks
                                    </div>
                                    <div className="absolute bottom-full left-[63px] w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#E7E1E1]"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Track and Trace Map */}
                    <div>
                        <IVFTrackAndTraceMap canisterNumber={canisterId} />
                    </div>

                    {/* Quality Parameter Table and Quality Tracking Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Quality Parameter Table */}
                        <div>
                            <IVFQualityParametersTable tankId={canisterId} />
                        </div>

                        {/* Quality Tracking Chart */}
                        <div>
                            <IVFQualityTrackingChart canisterNumber={canisterId} />
                        </div>
                    </div>
                </div>
            </main>

            {/* Stakeholder Chat Box */}
            <StakeholderChatBox
                isOpen={showStakeholderChatScreen}
                onClose={() => setShowStakeholderChatScreen(false)}
                canisterNumber={canisterId}
                onMessagesUpdated={() => {
                    // WebSocket will automatically update unread count
                    // No need to manually refresh
                }}
            />

            {/* Modals */}
            <CriticalAlertsModal
                isOpen={showCriticalAlerts}
                onClose={() => setShowCriticalAlerts(false)}
                alerts={criticalAlerts.map((a) => ({
                    id: a.alert_id,
                    type: a.alert_type,
                    severity: a.severity === 'High' ? 'High' : a.severity === 'Medium' ? 'Medium' : 'Low',
                    patientId: a.tank_code
                        ? a.tank_code
                        : a.canister_number
                            ? a.canister_number
                            : `Canister ${a.canister_id}`,
                    message: a.message,
                    timestamp: new Date(a.occurred_at).toLocaleString(),
                    status: a.status === 'Active' ? 'Active' : 'Acknowledged',
                }))}
                loading={loadingAlerts}
                patientIdLabel="Tank Code"
                onAcknowledge={async (alertId) => {
                    try {
                        await ivfAlertsService.acknowledgeAlert(alertId);
                        // Refresh alerts after acknowledgment
                        fetchCriticalAlerts();
                    } catch (error) {
                        console.error('Error acknowledging alert:', error);
                        throw error;
                    }
                }}
            />
            <MyTasksModal
                isOpen={showMyTasks}
                onClose={() => setShowMyTasks(false)}
                tasks={myTasks.map(task => {
                    try {
                        return {
                            id: task.id.toString(),
                            patientId: task.patient_id || 'N/A',
                            tankCode: task.tank_code || undefined,
                            canisterNumber: task.canister_number || canisterId || 'N/A',
                            taskName: task.task_name,
                            description: task.description || '',
                            assigneeBy: task.created_by 
                                ? `${task.created_by.first_name || ''} ${task.created_by.last_name || ''}`.trim() || 'Unknown'
                                : 'Unknown',
                            assignedTo: task.assignee
                                ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unknown'
                                : 'Unknown',
                            dueDate: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A',
                            priority: task.priority,
                            status: task.status
                        };
                    } catch (error) {
                        console.error('Error transforming task:', task, error);
                        return {
                            id: task.id?.toString() || 'unknown',
                            patientId: task.patient_id || 'N/A',
                            tankCode: task.tank_code || undefined,
                            canisterNumber: task.canister_number || canisterId || 'N/A',
                            taskName: task.task_name || 'Unknown Task',
                            description: task.description || '',
                            assigneeBy: 'Unknown',
                            assignedTo: 'Unknown',
                            dueDate: 'N/A',
                            priority: task.priority || 'Medium',
                            status: task.status || 'Not started'
                        };
                    }
                })}
                loading={loadingTasks}
                variant="ivf"
                currentUserName={currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : ''}
                currentUserId={currentUserId}
                userRole={userRole || currentUser?.role || ''}
                defaultCanisterNumber={canisterId || ''}
                onTaskCreated={() => {
                    // Refresh tasks after creation
                    fetchMyTasks();
                }}
                onAdd={() => {
                    // Task creation handled by onTaskCreated callback
                }}
                onEdit={async (task: MyTask) => {
                    try {
                        const taskId = parseInt(task.id);
                        if (isNaN(taskId)) {
                            console.error('Invalid task ID:', task.id);
                            return;
                        }

                        // Get assigneeId from the task (it should be stored when user selects from dropdown)
                        const assigneeId = task.assigneeId;
                        
                        // Prepare update data
                        const updateData: {
                            task_name?: string;
                            description?: string;
                            assignee_id?: string;
                            patient_id?: string;
                            tank_code?: string;
                            due_date?: string;
                            priority?: 'Low' | 'Medium' | 'High';
                            status?: 'Not started' | 'In progress' | 'Done';
                        } = {};

                        // Check if task was created by current user - they can edit all fields
                        const isCreatedByMe = task.assigneeBy?.trim().toLowerCase() === 
                            (currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim().toLowerCase() : '');

                        if (isCreatedByMe) {
                            // Creator can update all fields
                            updateData.task_name = task.taskName;
                            updateData.description = task.description;
                            if (assigneeId) {
                                // assignee_id should be a string (user_id)
                                updateData.assignee_id = String(assigneeId);
                            }

                            // IVF tasks are tank-scoped; CGT tasks are patient-scoped
                            if (task.canisterNumber && task.canisterNumber !== 'N/A') {
                                updateData.tank_code = String(task.canisterNumber);
                                updateData.patient_id = undefined;
                            } else {
                                updateData.patient_id = task.patientId && task.patientId !== 'N/A' ? task.patientId : undefined;
                            }

                            // Parse date - handle both ISO format and locale date string
                            if (task.dueDate && task.dueDate !== 'N/A') {
                                try {
                                    const date = new Date(task.dueDate);
                                    if (!isNaN(date.getTime())) {
                                        updateData.due_date = date.toISOString();
                                    }
                                } catch (e) {
                                    console.error('Error parsing date:', task.dueDate, e);
                                }
                            }
                            updateData.priority = task.priority;
                            updateData.status = task.status;
                        } else {
                            // Assignee can only update status - use dedicated status update endpoint
                            if (task.status) {
                                await tasksService.updateTaskStatus(taskId, task.status);
                                // Refresh tasks after update
                                fetchMyTasks();
                                return; // Early return since we've handled the update
                            }
                            return;
                        }

                        // Call update API for full task updates (when creator edits)
                        if (Object.keys(updateData).length > 0) {
                            await tasksService.updateTask(taskId, updateData);
                        }

                        // Refresh tasks after update
                        fetchMyTasks();
                    } catch (error) {
                        console.error('Error updating task:', error);
                    }
                }}
                onDelete={() => {
                    // TODO: Implement delete task functionality
                }}
            />
            {/* Legacy modal retained but not used by icon click */}
            <StakeholderChatsModal
                isOpen={showStakeholderChats}
                onClose={() => setShowStakeholderChats(false)}
                chats={stakeholderChats}
            />
        </div>
    );
}

