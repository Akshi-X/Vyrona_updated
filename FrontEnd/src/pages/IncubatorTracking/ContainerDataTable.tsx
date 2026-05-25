import { useEffect, useState } from 'react';
import { ivfService, type IvfCycleWithLogs } from '../../services/ivfService';

type Props = {
  incubatorId: number;
  chamberId: string;
};

type FunnelRow = IvfCycleWithLogs & {
  injected: number;
  fertilized: number;
  cleaved: number;
  day3Good: number;
  blast: number;
  goodGrade: number;
  frozen: number;
  transfer: number;
};

function gradeTier(grade: string): 'high' | 'mid' | 'low' {
  if (!grade || grade.length < 2) return 'low';
  const exp = parseInt(grade[0]);
  if (isNaN(exp)) return 'low';
  const icmTe = grade.slice(1);
  if (exp >= 4 && (icmTe === 'AA' || icmTe === 'AB' || icmTe === 'BA')) return 'high';
  if (exp >= 3 && icmTe !== 'CC') return 'mid';
  return 'low';
}

function parseD3Frag(grade: string | null): string {
  if (!grade) return '';
  const m = grade.match(/^(\d+)C(\d+)$/);
  return m ? m[2] : '';
}

function computeFunnel(c: IvfCycleWithLogs): FunnelRow {
  const logs = c.logs;
  const injected = logs.length;
  const fertilized = logs.filter(l => l.d1_pn === '2PN').length;
  const cleaved = logs.filter(l => l.d3_grade).length;
  const day3Good = logs.filter(l => {
    const frag = parseD3Frag(l.d3_grade);
    return frag === '0' || frag === '1';
  }).length;
  const blast = logs.filter(l => l.blast_grade).length;
  const goodGrade = logs.filter(l => l.blast_grade && gradeTier(l.blast_grade) === 'high').length;
  const frozen = logs.filter(l => l.fate?.toLowerCase() === 'freeze').length;
  const transfer = logs.filter(l => l.fate?.toLowerCase() === 'transfer').length;
  return { ...c, injected, fertilized, cleaved, day3Good, blast, goodGrade, frozen, transfer };
}

function Num({ n }: { n: number }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded text-[11px] font-bold ${n > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
      {n}
    </span>
  );
}

function StatusChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>;
  const cls =
    status === 'Active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'Completed'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export default function MockContainerDataTable({ incubatorId, chamberId }: Props) {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ivfService
      .listCycles({
        incubator_id: incubatorId,
        chamber_position: chamberId || undefined,
        limit: 200,
      })
      .then(cycles =>
        Promise.all(cycles.map(c => ivfService.getCycleWithLogs(c.cycle_id)))
      )
      .then(withLogs => {
        if (!cancelled) setRows(withLogs.map(computeFunnel));
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [incubatorId, chamberId]);

  return (
    <div className="bg-white border border-line rounded-lg p-4 h-[398px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-black text-[16px]">
          Container Data
          {chamberId ? <span className="ml-2 text-sm font-normal text-gray-400">· Chamber {chamberId}</span> : null}
        </h3>
        <div className="text-black text-sm">
          <span className="font-medium">Total Cycles: </span>
          <span className="font-semibold">{loading ? '…' : rows.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#F8F8F8] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="min-w-max w-full text-xs bg-white">
          <thead className="sticky top-0 z-10 bg-surface text-primary text-[12px] font-medium h-[56px]">
            <tr>
              <th className="px-3 py-2 text-left rounded-tl-[10px] whitespace-nowrap">HIS #</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Patient Name</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">OPU Date</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Cycle Type</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Injection Method</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Injected</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Fertilized</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Cleaved</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Day 3 Good</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Blast</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Good Grade</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Frozen</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Transfer</th>
              <th className="px-3 py-2 text-left rounded-tr-[10px] whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="px-3 py-10 text-center text-xs text-gray-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-10 text-center text-xs text-gray-400">
                  {chamberId ? `No cycles in Chamber ${chamberId}` : 'No cycles in this incubator'}
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.cycle_id} className="text-black text-[13px] h-[52px] hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{r.his_id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.patient_name || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.opu_date ? new Date(r.opu_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.cycle_type || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.injection_method || '—'}</td>
                  <td className="px-3 py-2 text-center"><Num n={r.injected} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.fertilized} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.cleaved} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.day3Good} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.blast} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.goodGrade} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.frozen} /></td>
                  <td className="px-3 py-2 text-center"><Num n={r.transfer} /></td>
                  <td className="px-3 py-2 whitespace-nowrap"><StatusChip status={r.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
