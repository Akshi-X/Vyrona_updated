import React, { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { COLORS } from '../../constants/colors';

const modules = [
  'Track & Trace',
  'Quality Monitoring',
  'Compliance Automation',
  'Risk Module',
  'Trust & Safety',
  'Monitoring',
  'Insights',
  'Other',
];

interface CommentItem {
  id: string;
  author: string;
  content: string;
  createdAt: string; // ISO or human
}

interface HistoryItem {
  id: string;
  text: string;
  createdAt: string;
}

const NAME_MAX = 80;
const NAME_REGEX = /^[A-Za-z ,.'-]{2,80}$/;

const Support: React.FC = () => {
  const location = useLocation() as { state?: any };
  const readonly = Boolean(location.state?.readonly);
  const hideAttach = Boolean(location.state?.hideAttach);
  const lockIdentity = Boolean(location.state?.lockIdentity);
  const prefill = location.state?.prefill || {};

  const [fullName, setFullName] = useState<string>(prefill.fullName || '');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState<string>(prefill.workEmail || '');
  const [department, setDepartment] = useState<string>(prefill.department || '');
  const [feedbackType, setFeedbackType] = useState<string>(prefill.feedbackType || '');
  const [subject, setSubject] = useState<string>(prefill.subject || '');
  const [description, setDescription] = useState<string>(prefill.description || '');
  const [priority, setPriority] = useState<string>(prefill.priority || '');
  const [status] = useState<string>(prefill.status || 'Under Review');

  const [, setFiles] = useState<File[]>([]);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Comments & History (Jira-like)
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([
    { id: 'c1', author: 'Sarah Johnson', content: 'Investigating the alert thresholds.', createdAt: '2025-10-14 10:12' },
    { id: 'c2', author: 'QA Bot', content: 'Auto-check complete. No outages detected.', createdAt: '2025-10-14 10:30' }
  ]);
  const [history] = useState<HistoryItem[]>([
    { id: 'h1', text: 'Status changed from Created to Under Review by System', createdAt: '2025-10-14 10:05' },
    { id: 'h2', text: 'Priority set to Medium by Sarah Johnson', createdAt: '2025-10-14 10:06' }
  ]);

  const addComment = () => {
    if (!newComment.trim()) return;
    const now = new Date();
    const item: CommentItem = {
      id: `c-${now.getTime()}`,
      author: fullName || 'You',
      content: newComment.trim(),
      createdAt: now.toISOString().slice(0, 16).replace('T', ' ')
    };
    setComments([item, ...comments]);
    setNewComment('');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  };

  const validateName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Full name is required';
    if (trimmed.length > NAME_MAX) return `Full name must be ≤ ${NAME_MAX} characters`;
    if (!NAME_REGEX.test(trimmed)) return 'Enter a valid name (letters, spaces, , . " - allowed)';
    return null;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly) return;
    const err = validateName(fullName);
    if (err) {
      setFullNameError(err);
      return;
    }
    setFullNameError(null);
    alert('Feedback submitted!');
  };

  const openFileDialog = () => {
    if (!readonly) fileInputRef.current?.click();
  };

  const controlBase = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200';
  const controlBg = 'bg-slate-50';
  const disabledCls = 'cursor-not-allowed bg-gray-100 text-gray-600 border-gray-200';

  const statusClass = (value: string) => {
    if (value === 'Created') return 'bg-blue-100 text-blue-800';
    if (value === 'Completed') return 'bg-green-100 text-green-800';
    return 'bg-yellow-100 text-yellow-800'; // Under Review
  };

  const identityDisabled = readonly || lockIdentity;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="w-full" style={{ backgroundColor: COLORS.primary.purple }}>
        <div className="px-4 sm:px-6 lg:px-10 py-3">
          <div className="flex items-center text-white">
            <button className="mr-2 hover:opacity-90" aria-label="Back">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs sm:text-sm font-medium">Support & Feedback</span>
          </div>
        </div>
      </div>

      {/* Page body */}
      <div className="flex-1 w-full">
        <div className="w-full" style={{ background: 'linear-gradient(180deg, #f3f4f6 0%, #f8f9fa 100%)' }}>
          <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-0 py-6 sm:py-8">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-5 sm:px-6 pt-5 sm:pt-6">
                <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Grape Support & Feedback</h1>
                <p className="text-sm sm:text-base text-gray-500 mt-2">This form is built for our partner teams using Grape. Whether you’ve encountered an issue or want to request a feature, please fill out the details below. Our team will respond within 24 hours.</p>
              </div>

              <form onSubmit={onSubmit} className="px-5 sm:px-6 pb-6">
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Full Name<span className="text-red-500"> *</span></label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => { setFullName(e.target.value); if (fullNameError) setFullNameError(null); }}
                      maxLength={NAME_MAX}
                      disabled={identityDisabled}
                      className={`${controlBase} ${identityDisabled ? disabledCls : controlBg}`}
                      placeholder="Enter your full name"
                    />
                    {fullNameError && (<p className="mt-1 text-xs text-red-600">{fullNameError}</p>)}
                  </div>
                  {/* Work Email */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Work Email<span className="text-red-500"> *</span></label>
                    <input
                      type="email"
                      value={workEmail}
                      onChange={(e) => setWorkEmail(e.target.value)}
                      disabled={identityDisabled}
                      className={`${controlBase} ${identityDisabled ? disabledCls : controlBg}`}
                      placeholder="Enter your work email"
                    />
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Department or Team</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      disabled={identityDisabled}
                      className={`${controlBase} ${identityDisabled ? disabledCls : controlBg}`}
                    >
                      <option value="">Select</option>
                      <option>Quality Assurance</option>
                      <option>Supply Chain Ops</option>
                      <option>Compliance</option>
                      <option>Other</option>
                    </select>
                  </div>

                  {/* Type of Feedback */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Type of Feedback</label>
                    <select
                      value={feedbackType}
                      onChange={(e) => setFeedbackType(e.target.value)}
                      disabled={readonly}
                      className={`${controlBase} ${readonly ? disabledCls : controlBg}`}
                    >
                      <option value="">Select</option>
                      <option>Bug / Technical Issue</option>
                      <option>Feature Request</option>
                      <option>Data Quality Issue</option>
                      <option>Usability / UI</option>
                      <option>Other</option>
                    </select>
                  </div>

                  {/* Subject */}
                  <div className="sm:col-span-2">
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Subject / Title</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={readonly}
                      className={`${controlBase} ${readonly ? disabledCls : controlBg}`}
                      placeholder="e.g., 'No alert on excursion during shipment #5238'"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="mt-4">
                  <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Detailed Description</label>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={readonly}
                    className={`w-full rounded-md border ${readonly ? 'border-gray-200' : 'border-gray-300'} ${readonly ? 'bg-gray-100 text-gray-600' : 'bg-slate-50'} px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 ${readonly ? 'cursor-not-allowed opacity-70' : ''}`}
                    placeholder="Explain what happened, what you expected, and any relevant shipment/device ID."
                  />
                </div>

                {/* Attach: full width (conditional) */}
                {!readonly && !hideAttach && (
                  <div className="mt-4">
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Attach Supporting Files (Optional)</label>
                    <div
                      ref={dropRef}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={openFileDialog}
                      className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer px-4 py-6 text-center`}
                    >
                      <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      <div className="text-sm text-gray-700">Click to upload or drag and drop</div>
                      <div className="text-[11px] text-gray-400">Max size 10MB</div>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
                    </div>
                  </div>
                )}

                {/* Priority and Modules in one alignment (same row) */}
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Priority */}
                  <div>
                    <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Priority<span className="text-red-500"> *</span></label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={readonly}
                      className={`${controlBase} ${readonly ? disabledCls : controlBg}`}
                    >
                      <option value="">Select priority level</option>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>

                  {/* Affected Modules */}
                  <div>
                    {/* Title outside of container */}
                    <p className="text-[12px] font-medium text-gray-900 mb-2">Affected Modules</p>
                    <div className="rounded-md border border-gray-200 p-3 h-full">
                      <div className="grid grid-cols-1 gap-2">
                        {modules.map((label) => (
                          <label key={label} className="flex items-center gap-2">
                            <input type="checkbox" disabled={readonly} className="h-3.5 w-3.5 rounded border-gray-300 text-purple-700 focus:ring-purple-200" />
                            <span className="text-[12px] text-gray-800">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status (non-editable segmented control) */}
                {readonly && (
                <div className="mt-4">
                  <label className="block text-[12px] font-medium text-gray-900 mb-1.5">Status</label>
                  <div className="inline-flex rounded-md border border-gray-200 overflow-hidden pointer-events-none select-none">
                    <span className={`px-3 py-1.5 text-xs font-medium ${status === 'Created' ? statusClass('Created') : 'bg-gray-50 text-gray-400'}`}>Created</span>
                    <span className={`px-3 py-1.5 text-xs font-medium border-l border-gray-200 ${status === 'Under Review' ? statusClass('Under Review') : 'bg-gray-50 text-gray-400'}`}>Under Review</span>
                    <span className={`px-3 py-1.5 text-xs font-medium border-l border-gray-200 ${status === 'Completed' ? statusClass('Completed') : 'bg-gray-50 text-gray-400'}`}>Completed</span>
                  </div>
                </div>
                )}

                {/* Jira-like Comments & History */}
                {readonly && (
                <div className="mt-6">
                  <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-6" aria-label="Tabs">
                      <button type="button" onClick={() => setActiveTab('comments')} className={`whitespace-nowrap py-2 text-sm font-medium border-b-2 ${activeTab==='comments' ? 'border-purple-700 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Comments</button>
                      <button type="button" onClick={() => setActiveTab('history')} className={`whitespace-nowrap py-2 text-sm font-medium border-b-2 ${activeTab==='history' ? 'border-purple-700 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>History</button>
                    </nav>
                  </div>

                  {activeTab === 'comments' ? (
                    <div className="pt-4">
                      {/* Add comment */}
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-800 text-xs font-semibold">{(fullName||'U').slice(0,1)}</div>
                        <div className="flex-1">
                          <textarea
                            rows={3}
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200`}
                            placeholder={'Add a comment...'}
                          />
                          <div className="mt-2 flex justify-end">
                            <button type="button" onClick={addComment} disabled={!newComment.trim()} className={`px-3 py-1.5 text-sm rounded-md text-white ${!newComment.trim()? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-700 hover:bg-purple-800'}`}>Add Comment</button>
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
                  ) : (
                    <div className="pt-4">
                      <ul className="space-y-3">
                        {history.map(h => (
                          <li key={h.id} className="flex items-start gap-3">
                            <div className="h-2 w-2 rounded-full bg-gray-300 mt-2" />
                            <div>
                              <p className="text-sm text-gray-800">{h.text}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{h.createdAt}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                )}

                {/* Optional schedule call (full width, below row) */}
                {!readonly && !hideAttach && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-900">Optional: Schedule a Call</h3>
                  <p className="mt-2 text-[13px] text-gray-800">
                    Schedule 15-min Call: {" "}
                    <a href="https://mygrape.org/contact/" className="text-purple-700 underline">https://mygrape.org/contact/</a>
                  </p>
                  <label className="mt-4 flex items-center gap-2">
                    <input type="checkbox" disabled={readonly} className="h-4 w-4 rounded border-gray-300 text-purple-700 focus:ring-purple-200" />
                    <span className="text-[14px] text-gray-900">I agree to be contacted regarding this issue. <span className="text-purple-700">*</span></span>
                  </label>
                </div>
                )}

                {/* Footer actions */}
                {!readonly && (
                <div className="mt-6 flex items-center justify-end">
                  <button type="submit" className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-medium text-white shadow-sm hover:opacity-90`} style={{ backgroundColor: COLORS.primary.purple }}>
                    Submit Feedback
                  </button>
                </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
