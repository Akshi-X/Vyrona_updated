import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from '../../components/Sidebar';
import { DatabaseTable } from '../../components/DatabaseTable';

export default function Database() {
  const { isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-600">Please login to access the database.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#fcfaff] flex w-full" style={{ height: '100vh' }}>
      {/* Left Sidebar */}
      <Sidebar onLogout={logout} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden ml-60">
        {/* Header */}
        <header className="h-[63px] bg-black flex items-center justify-end px-6 gap-6 flex-shrink-0">
          <div className="w-[30px] h-[30px] bg-[#9c3aa6] rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              MV
            </span>
          </div>
        </header>

        {/* Database Content */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-black text-2xl">
              Patient Records
            </h1>
            {/* TODO: Add total patients and add patient button */}
            {/* <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Total Patients: <span className="font-semibold text-[#6b1176]">{patientData.patients.length}</span>
              </div>
              <button className="bg-[#6b1176] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#5a0f66] transition-colors">
                Add Patient
              </button>
            </div> */}
          </div>

          {/* Database Table */}
          <div className="flex-1">
            <DatabaseTable pharmaId="1" />
          </div>
        </div>
      </main>
    </div>
  );
}
