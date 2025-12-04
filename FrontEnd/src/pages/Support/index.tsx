import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { COLORS } from '../../constants/colors';
import { feedbackApi, type FeedbackSubmission } from '../../api/feedbackApi';
import { userService } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../../components/Header';
import AttachmentThumbnail from '../../components/AttachmentThumbnail';

const modules = [
  'Dashboard',
  'Database',
  'Track shipment',
  'Control Tower',
  'After care',
  'Failure',
  'Stakeholder chat',
  'Critical alert',
  'MyTask',
];

interface CommentItem {
  id: string;
  author: string;
  content: string;
  createdAt: string; // ISO or human
}


const NAME_MAX = 80;
const NAME_REGEX = /^[A-Za-z ,.'-]{2,80}$/;

const Support: React.FC = () => {
  const location = useLocation() as { state?: any };
  const navigate = useNavigate();
  const { isEmailNotificationsEnabled } = useAuth();
  const readonly = Boolean(location.state?.readonly);
  const hideAttach = Boolean(location.state?.hideAttach);
  const lockIdentity = Boolean(location.state?.lockIdentity);
  const prefill = location.state?.prefill || {};
  const initialFeedbackId = location.state?.feedbackId || prefill.feedbackId;
  const [activeFeedbackId] = useState<string | undefined>(initialFeedbackId);

  const [fullName, setFullName] = useState<string>(prefill.fullName || '');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState<string>(prefill.workEmail || '');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<string>(prefill.feedbackType || '');
  const [subject, setSubject] = useState<string>(prefill.subject || '');
  const [description, setDescription] = useState<string>(prefill.description || '');
  const [priority, setPriority] = useState<string>(prefill.priority || '');
  const [status, setStatus] = useState<string>(prefill.status || 'Open');
  const [selectedModuleIndices, setSelectedModuleIndices] = useState<number[]>([]);
  const [agreementChecked, setAgreementChecked] = useState<boolean>(false);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<{path: string, filename: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Comments
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<string | null>(null);

  // Fetch user profile data if not provided via prefill
  useEffect(() => {
    if (!fullName || !workEmail) {
      const fetchProfile = async () => {
        try {
          const profile = await userService.getProfile();
          const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
          if (!fullName) setFullName(name || 'User');
          if (!workEmail) setWorkEmail(profile.email || '');
        } catch (error) {
          if (!fullName) setFullName('User');
          if (!workEmail) setWorkEmail('user@example.com');
        }
      };
      fetchProfile();
    }
  }, [fullName, workEmail]);

  // Fetch current user's name for comments
  useEffect(() => {
    const fetchCurrentUserName = async () => {
      try {
        const profile = await userService.getProfile();
        const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
        setCurrentUserName(name || 'User');
      } catch (error) {
        setCurrentUserName('User');
      }
    };
    fetchCurrentUserName();
  }, []);

  const addComment = async () => {
    if (!newComment.trim()) return;
    if (!activeFeedbackId) return;
    try {
      const res = await feedbackApi.addComment(activeFeedbackId, newComment.trim(), isEmailNotificationsEnabled);
    const now = new Date();
    const item: CommentItem = {
        id: String(res.comment_id),
      author: currentUserName || 'You',
      content: newComment.trim(),
      createdAt: now.toISOString().slice(0, 16).replace('T', ' ')
    };
      setComments(prev => [item, ...prev]);
    setNewComment('');
    } catch (e) {
      // optionally surface error UI
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!activeFeedbackId) {
      return;
    }
    if (newStatus === status) return; // No change needed
    
    const previousStatus = status; // Store the previous status
    setIsUpdatingStatus(true);
    setStatusUpdateError(null);
    setStatusUpdateSuccess(null);
    
    // Optimistically update the UI
    setStatus(newStatus);
    
    try {
      const response = await feedbackApi.updateFeedbackStatus(activeFeedbackId, newStatus, isEmailNotificationsEnabled);
      
      setStatusUpdateSuccess(`Status updated from ${response.old_status} to ${response.new_status}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setStatusUpdateSuccess(null);
      }, 3000);
    } catch (error: any) {
      setStatusUpdateError(error.message || 'Failed to update status');
      // Revert to the previous status on error
      setStatus(previousStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Fetch full ticket details when viewing a ticket
  useEffect(() => {
    if (!activeFeedbackId || !readonly) return;
    
    feedbackApi.getFeedbackDetails(activeFeedbackId)
      .then(details => {
        // Update all fields with the full ticket data
        setSubject(details.subject || '');
        setDescription(details.description || '');
        
        // Update user information from ticket creator (not current user)
        setFullName(details.submitted_by || '');
        setWorkEmail(details.submitted_by_email || '');
        
        // Map priority values to match dropdown options
        const priorityMap: Record<string, string> = {
          'LOW': 'low',
          'MEDIUM': 'medium', 
          'HIGH': 'high',
          'CRITICAL': 'critical'
        };
        const mappedPriority = priorityMap[details.priority] || details.priority.toLowerCase() || '';
        setPriority(mappedPriority);
        setFeedbackType(details.feedback_type || '');
        
        // Update status from API response
        setStatus(details.status || 'Open');
        
         // Parse affected modules (it's now an array of strings)
         const affectedModulesList = Array.isArray(details.affected_modules) 
           ? details.affected_modules 
           : (details.affected_modules ? [details.affected_modules] : []);
         
         // Set the checkboxes based on all selected modules
         // Map backend module values to UI module names and find their indices
         const moduleMap: Record<string, string> = {
           'dashboard': 'Dashboard',
           'database': 'Database',
           'track_shipment': 'Track shipment',
           'control_tower': 'Control Tower',
           'after_care': 'After care',
           'failure': 'Failure',
           'stakeholder_chat': 'Stakeholder chat',
           'critical_alert': 'Critical alert',
           'my_task': 'MyTask',
           'other': 'Dashboard' // Default fallback
         };
         
         const selectedIndices = affectedModulesList
           .map(module => {
             const uiModuleName = moduleMap[module] || module;
             return modules.findIndex(m => m === uiModuleName);
           })
           .filter(index => index !== -1);
         
         if (selectedIndices.length > 0) {
           setSelectedModuleIndices(selectedIndices);
         }

         // Set existing attachments if available
         if (details.attachment_paths && details.attachment_paths.length > 0) {
           const attachments = details.attachment_paths.map(attachmentPath => {
             const filename = attachmentPath.split('/').pop() || 'attachment';
             return {
               path: attachmentPath,
             filename: filename
             };
           });
           setExistingAttachments(attachments);
         } else {
           setExistingAttachments([]);
         }
      })
      .catch(() => {
      });
  }, [activeFeedbackId, readonly]);

  useEffect(() => {
    if (!activeFeedbackId) return;
    feedbackApi.getComments(activeFeedbackId)
      .then(list => {
        const mapped: CommentItem[] = list.map(c => ({
          id: String(c.id),
          author: c.commented_by || 'Unknown User', // Now returns full name from backend
          content: c.comment,
          createdAt: c.created_at
        }));
        setComments(mapped.reverse()); // newest last to match prepend behavior
      })
      .catch(() => {
        setComments([]);
      });
  }, [activeFeedbackId]);

  const canAddComment = Boolean(newComment.trim() && activeFeedbackId);

  const handleModuleChange = (index: number, checked: boolean) => {
    // Ensure index is a number
    const numericIndex = Number(index);
    
    if (checked) {
      setSelectedModuleIndices(prev => [...prev, numericIndex]);
    } else {
      setSelectedModuleIndices(prev => prev.filter(i => i !== numericIndex));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) {
      setSelectedFiles(prev => [...prev, ...dropped]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Full name is required';
    if (trimmed.length > NAME_MAX) return `Full name must be ≤ ${NAME_MAX} characters`;
    if (!NAME_REGEX.test(trimmed)) return 'Enter a valid name (letters, spaces, , . " - allowed)';
    return null;
  };

  const validateForm = () => {
    const errors: string[] = [];
    if (!fullName || fullName.trim().length < 2) errors.push('Full name is required');
    if (!workEmail || workEmail.trim().length < 5) errors.push('Work email is required');
    if (workEmail && !workEmail.includes('@')) errors.push('Please enter a valid email address');
    if (!subject || subject.trim().length < 5) errors.push('Subject must be at least 5 characters');
    if (!description || description.trim().length < 10) errors.push('Description must be at least 10 characters');
    if (!priority) errors.push('Priority is required');
    if (!feedbackType) errors.push('Feedback type is required');
    if (selectedModuleIndices.length === 0) errors.push('Please select at least one affected module');
    if (!agreementChecked) errors.push('You must agree to be contacted regarding this issue');
    return errors;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly) return;
    
    const nameErr = validateName(fullName);
    if (nameErr) {
      setFullNameError(nameErr);
      return;
    }
    
    const formErrors = validateForm();
    if (formErrors.length > 0) {
      setSubmitMessage(`❌ ${formErrors.join(', ')}`);
      return;
    }
    
    setFullNameError(null);
    setSubmitMessage(null);

    setIsSubmitting(true);
    try {
      // Get selected modules from state
      const selectedModules = selectedModuleIndices
        .filter(index => index >= 0 && index < modules.length) // Validate indices
        .map(index => modules[index])
        .filter(module => module); // Remove any undefined values
      
      // Map UI module names to backend enum values
      const moduleMap: Record<string, string> = {
        'Dashboard': 'dashboard',
        'Database': 'database',
        'Track shipment': 'track_shipment',
        'Control Tower': 'control_tower',
        'After care': 'after_care',
        'Failure': 'failure',
        'Stakeholder chat': 'stakeholder_chat',
        'Critical alert': 'critical_alert',
        'MyTask': 'my_task',
      };
      
      // Map all selected modules to backend enum values
      const validEnumValues = ['dashboard', 'database', 'track_shipment', 'control_tower', 'after_care', 'failure', 'stakeholder_chat', 'critical_alert', 'my_task', 'other'];
      const affectedModules = selectedModules
        .map(module => moduleMap[module] || 'other')
        .filter(module => validEnumValues.includes(module));
      
      // Ensure at least one module is selected
      if (affectedModules.length === 0) {
        affectedModules.push('other');
      }
      
      const feedbackData: FeedbackSubmission = {
        department: 'other', // Default department since field is removed
        feedback_type: feedbackType || 'other',
        subject,
        description,
        priority: priority || 'medium',
        affected_modules: affectedModules,
        attachments: selectedFiles, // Send all selected files to backend
      };


      const response = await feedbackApi.submitFeedback(feedbackData);
      
      // Navigate to success page with ticket information
      navigate('/success', {
        state: {
          ticketId: response.feedback_id,
          ticketNumber: response.ticket_id,
          message: response.message
        }
      });
    } catch (error) {
      setSubmitMessage(`❌ Failed to submit feedback: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openFileDialog = () => {
    if (!readonly) fileInputRef.current?.click();
  };


  // Jira-style status colors and icons
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Open':
        return '#3B82F6'; // Blue
      case 'In Progress':
        return '#F59E0B'; // Amber/Orange
      case 'Completed':
        return '#10B981'; // Green
      case 'Reopen':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  };

  const identityDisabled = readonly || lockIdentity;

  // Debug status value
  useEffect(() => {
  }, [status]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Support & Feedback" />

      <div className="pt-[calc(63px+1rem)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">myGrape Support & Feedback</h1>
              <p className="text-sm text-gray-500 mt-2">This form is built for our partner teams using myGrape. Whether you've encountered an issue or want to request a feature, please fill out the details below. Our team will respond within 24 hours.</p>
            </div>

            <form onSubmit={onSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Full Name<span className="text-red-500"> *</span></label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); if (fullNameError) setFullNameError(null); }}
                      maxLength={NAME_MAX}
                      disabled={identityDisabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        identityDisabled
                          ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                          : fullNameError
                          ? 'border-red-500 bg-white text-gray-900 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                      }`}
                      placeholder="Enter your full name"
                    />
                    {fullNameError && (<p className="mt-1 text-xs text-red-600">{fullNameError}</p>)}
                  </div>
                  {/* Work Email */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Work Email<span className="text-red-500"> *</span></label>
                    <input
                      type="email"
                      value={workEmail}
                      onChange={(e) => setWorkEmail(e.target.value)}
                      disabled={identityDisabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        identityDisabled
                          ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                      }`}
                      placeholder="Enter your work email"
                    />
                  </div>

                  {/* Type of Feedback */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">
                      Type of Feedback<span className="text-red-500"> *</span>
                    </label>
                    <select
                      value={feedbackType}
                      onChange={(e) => setFeedbackType(e.target.value)}
                      disabled={readonly}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        readonly
                          ? 'cursor-not-allowed bg-gray-100 text-gray-600 border-gray-200'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                      }`}
                    >
                      <option value="">Select</option>
                      <option value="bug">Bug / Technical Issue</option>
                      <option value="data_quality_issue">Data Quality Issue</option>
                      <option value="feature_request">Feature Request</option>
                      <option value="ux_workflow_improvement">Usability / UI</option>
                      <option value="api_integration">API Integration</option>
                      <option value="compliance_concern">Compliance Concern</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Subject */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-black mb-2">Subject / Title<span className="text-red-500"> *</span></label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={readonly}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        readonly
                          ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                      }`}
                      placeholder="e.g., 'No alert on excursion during shipment #5238'"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="mt-8">
                  <label className="block text-sm font-bold text-black mb-2">Detailed Description<span className="text-red-500"> *</span></label>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={readonly}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                      readonly
                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                    }`}
                    placeholder="Explain what happened, what you expected, and any relevant shipment/device ID."
                  />
                </div>

                {/* Debug info - Remove in production */}
                {false && (
                  <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <p>Debug: existingAttachments = {JSON.stringify(existingAttachments)}</p>
                    <p>Debug: readonly = {readonly.toString()}</p>
                    <p>Debug: activeFeedbackId = {activeFeedbackId}</p>
                  </div>
                )}

                {/* Existing Attachments (for viewing tickets) - Always visible */}
                {existingAttachments.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Ticket Attachments ({existingAttachments.length}):</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {existingAttachments.map((attachment, index) => (
                        <AttachmentThumbnail
                          key={`${attachment.filename}-${index}`}
                          attachmentPath={attachment.path}
                          filename={attachment.filename}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Attach: full width (conditional) */}
                {!readonly && !hideAttach && (
                    <div className="mt-8">
                      <label className="block text-sm font-bold text-black mb-2">Attach Supporting Files (Optional)</label>
                      
                      {/* File Upload Area */}
                      <div
                        ref={dropRef}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={openFileDialog}
                        className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer px-4 py-6 text-center hover:border-gray-400 transition-colors`}
                      >
                        <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                        </svg>
                        <div className="text-sm text-gray-700">Click to upload or drag and drop</div>
                        <div className="text-[11px] text-gray-400">Max size 10MB per file</div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          Supported: PDF, DOC, DOCX, TXT, JPG, JPEG, PNG, XLSX, XLS, CSV, ZIP, RAR
                        </div>
                        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.zip,.rar" />
                      </div>

                      {/* Selected Files Thumbnails */}
                      {selectedFiles.length > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Selected Files ({selectedFiles.length}):</span>
                            <button
                              onClick={clearAllFiles}
                              className="text-red-500 hover:text-red-700 text-sm"
                              type="button"
                            >
                              Clear All
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {selectedFiles.map((file, index) => (
                              <AttachmentThumbnail
                                key={`${file.name}-${index}`}
                                file={file}
                                filename={file.name}
                                onRemove={() => removeFile(index)}
                                canRemove={true}
                                className="w-full"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                )}

                {/* Priority and Modules in one alignment (same row) */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">
                      Priority<span className="text-red-500"> *</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={readonly}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                        readonly
                          ? 'cursor-not-allowed bg-gray-100 text-gray-600 border-gray-200'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-[#8b2a96]'
                      }`}
                    >
                      <option value="">Select priority level</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  {/* Affected Modules */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Affected Modules<span className="text-red-500"> *</span></label>
                    <div className="rounded-md border border-gray-300 p-4 bg-white">
                      <div className="grid grid-cols-1 gap-3">
                        {modules.map((label, index) => (
                          <label key={label} className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              disabled={readonly} 
                              checked={selectedModuleIndices.includes(index)}
                              onChange={(e) => handleModuleChange(index, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#8b2a96]"
                              style={{ accentColor: COLORS.primary.purple }}
                            />
                            <span className="text-sm text-gray-900">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status (Integrated Jira-style component) */}
                {readonly && (
                <div className="mt-8">
                  <label className="block text-sm font-bold text-black mb-2">
                    Status {isUpdatingStatus && <span className="text-xs text-gray-500">(Updating...)</span>}
                  </label>
                  
                  {/* Integrated Status Badge/Dropdown */}
                  <div className="relative inline-block">
                    <select
                      value={status}
                      onChange={(e) => updateStatus(e.target.value)}
                      disabled={isUpdatingStatus}
                      className={`appearance-none inline-flex items-center px-4 py-2 rounded-full text-xs font-semibold text-white shadow-sm transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 ${
                        isUpdatingStatus ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                      style={{
                        backgroundColor: getStatusColor(status),
                        boxShadow: `0 2px 4px ${getStatusColor(status)}40`,
                        minWidth: '120px'
                      }}
                    >
                      <option value="Open" style={{ backgroundColor: 'white', color: 'black' }}>Open</option>
                      <option value="In Progress" style={{ backgroundColor: 'white', color: 'black' }}>In Progress</option>
                      <option value="Completed" style={{ backgroundColor: 'white', color: 'black' }}>Completed</option>
                      <option value="Reopen" style={{ backgroundColor: 'white', color: 'black' }}>Reopen</option>
                    </select>
                    
                    {/* Custom dropdown arrow */}
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      {isUpdatingStatus ? (
                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {statusUpdateError && (
                    <p className="mt-1 text-xs text-red-600">{statusUpdateError}</p>
                  )}
                  {statusUpdateSuccess && (
                    <p className="mt-1 text-xs text-green-600">{statusUpdateSuccess}</p>
                  )}
                </div>
                )}

                {/* Comments Section */}
                {readonly && (
                <div className="mt-8">
                    <div className="pt-4">
                      {/* Add comment */}
                      <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-800 text-xs font-semibold">{(currentUserName || fullName || 'U').trim().slice(0,1).toUpperCase()}</div>
                        <div className="flex-1">
                          <textarea
                            rows={3}
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8b2a96]"
                            placeholder={'Add a comment...'}
                          />
                          <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={addComment}
                            disabled={!canAddComment}
                            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors duration-200 ${
                              !canAddComment 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-[#6b1176] hover:bg-[#8a2a95]'
                            }`}
                            aria-disabled={!canAddComment}
                          >
                            Add Comment
                          </button>
                          </div>
                        </div>
                      </div>

                      {/* Comments list */}
                      <div className="mt-6 space-y-4">
                        {comments.map(c => (
                          <div key={c.id} className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-xs font-semibold">{c.author.slice(0,1)}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{c.author}</span>
                                <span className="text-xs text-gray-500">{c.createdAt}</span>
                              </div>
                              <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{c.content}</p>
                            </div>
                          </div>
                        ))}
                        {comments.length === 0 && (
                          <p className="text-sm text-gray-500">No comments yet.</p>
                        )}
                      </div>
                    </div>
                </div>
                )}

                {/* Optional schedule call (full width, below row) */}
                {!readonly && !hideAttach && (
                <div className="mt-8">
                  <h3 className="text-sm font-bold text-black">Optional: Schedule a Call</h3>
                  <p className="mt-2 text-sm text-gray-700">
                    Schedule 15-min Call: {" "}
                    <a href="https://mygrape.org/contact/" target="_blank" rel="noopener noreferrer" className="text-[#6b1176] underline hover:text-[#8b2a96] font-semibold">https://mygrape.org/contact/</a>
                  </p>
                  <label className="mt-4 flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={agreementChecked}
                      onChange={(e) => setAgreementChecked(e.target.checked)}
                      disabled={readonly} 
                      className="h-4 w-4 rounded border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#8b2a96]" 
                      style={{ accentColor: COLORS.primary.purple }}
                    />
                    <span className="text-sm text-gray-900">I agree to be contacted regarding this issue. <span className="text-red-500">*</span></span>
                  </label>
                </div>
                )}

                {/* Submit Message */}
                {submitMessage && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${submitMessage.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                    {submitMessage}
                  </div>
                )}

                {/* Footer actions */}
                {!readonly && (
                <div className="mt-8 flex flex-col items-end">
                  <button 
                    type="submit" 
                    disabled={isSubmitting || !agreementChecked}
                    className={`inline-flex items-center px-4 py-3 bg-[#6b1176] text-white rounded-lg hover:bg-[#8a2a95] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium`}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
                )}
              </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;